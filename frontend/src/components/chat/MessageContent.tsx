import { useMemo, useRef, useLayoutEffect, useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { marked } from 'marked'
import { parseOOC } from '@/lib/oocParser'
import { createEmphasisAwareRenderer } from '@/lib/markedEmphasisRenderer'
import { resolveDisplayMacros } from '@/lib/resolveDisplayMacros'
import {
  stripAndDispatchMessageTags,
  subscribeTagInterceptorRegistry,
  getTagInterceptorRegistryVersion,
} from '@/lib/spindle/message-interceptors'
import { useStore } from '@/store'
import { OOCBlock as OOCBlockComponent, OOCIrcChatRoom } from './ooc'
import type { IrcEntry } from './ooc'
import ImageLightbox from './ImageLightbox'
import styles from './MessageContent.module.css'
import clsx from 'clsx'

interface MessageContentProps {
  content: string
  isUser: boolean
  userName: string
  isStreaming?: boolean
  messageId?: string
  chatId?: string
}

// Custom renderer for sheld prose classes
const renderer = createEmphasisAwareRenderer({
  emClass: styles.proseItalic,
  strongClass: styles.proseBold,
  inlineEmphasisClass: styles.proseInlineEmphasis,
})

renderer.code = ({ text, lang }) => {
  if (lang) {
    return `<pre data-code-lang="${lang}"><code>${escapeHtml(text)}</code></pre>`
  }
  return `<code>${escapeHtml(text)}</code>`
}

renderer.link = function ({ href, title, tokens }) {
  const inner = this.parser.parseInline(tokens)
  return `<a href="${escapeHtml(href || '')}" target="_blank" rel="noopener noreferrer" class="${styles.proseLink}">${inner}</a>`
}

renderer.image = ({ href, title, text }) =>
  `<span class="${styles.proseImageWrap}"><img src="${escapeHtml(href || '')}" alt="${escapeHtml(text || '')}"${title ? ` title="${escapeHtml(title)}"` : ''} class="${styles.proseImage}" data-lightbox /></span>`

renderer.table = function (token) {
  const headerCells = token.header.map((cell) => this.tablecell(cell)).join('')
  const headerRow = this.tablerow({ text: headerCells })
  const bodyRows = token.rows.map((row) => {
    const cells = row.map((cell) => this.tablecell(cell)).join('')
    return this.tablerow({ text: cells })
  }).join('')
  return `<table class="${styles.proseTable}"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`
}

renderer.tablerow = ({ text }) =>
  `<tr class="${styles.proseTableRow}">${text}</tr>`

renderer.tablecell = function (token) {
  const tag = token.header ? 'th' : 'td'
  const cls = token.header ? styles.proseTableHead : styles.proseTableCell
  const alignAttr = token.align ? ` style="text-align:${token.align}"` : ''
  const inner = this.parser.parseInline(token.tokens)
  return `<${tag} class="${cls}"${alignAttr}>${inner}</${tag}>`
}

renderer.html = ({ text }) => text

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
}

function normalizeQuotesInHTML(html: string): string {
  return html
    .replace(/&ldquo;|&rdquo;|&bdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;|&sbquo;/g, "'")
    .replace(/&laquo;|&raquo;/g, '"')
}

const BLOCK_CLOSE_RE = /^<\/(p|div|li|blockquote|h[1-6]|pre|table|tr|td|th)\b/i
const SKIP_OPEN_RE = /^<(pre|code)\b/i
const SKIP_CLOSE_RE = /^<\/(pre|code)\b/i

function colorizeDialogue(html: string): string {
  const parts = html.split(/(<[^>]*>)/)
  let result = ''
  let inQuote = false
  let skipDepth = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (i % 2 === 1) {
      if (SKIP_OPEN_RE.test(part)) skipDepth++
      else if (SKIP_CLOSE_RE.test(part)) skipDepth = Math.max(0, skipDepth - 1)

      if (inQuote && BLOCK_CLOSE_RE.test(part)) {
        result += '</span>'
        inQuote = false
      }
      result += part
      continue
    }

    if (skipDepth > 0 || !part) {
      result += part
      continue
    }

    let output = ''
    for (let j = 0; j < part.length; j++) {
      const isLiteral = part[j] === '"'
      const isEntity = !isLiteral
        && part[j] === '&'
        && part[j + 1] === 'q'
        && part[j + 2] === 'u'
        && part[j + 3] === 'o'
        && part[j + 4] === 't'
        && part[j + 5] === ';'

      if (isLiteral || isEntity) {
        if (!inQuote) {
          output += `<span class="${styles.proseDialogue}">&quot;`
          inQuote = true
        } else {
          output += '&quot;</span>'
          inQuote = false
        }
        if (isEntity) j += 5
      } else {
        output += part[j]
      }
    }
    result += output
  }

  if (inQuote) result += '</span>'

  return result
}

function addLazyLoadingToImages(html: string): string {
  return html.replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy"')
}

function formatContent(raw: string): string {
  if (!raw) return ''
  const normalized = normalizeQuotes(raw)
  let html = marked.parse(normalized, { async: false }) as string
  html = normalizeQuotesInHTML(html)
  html = colorizeDialogue(html)
  html = addLazyLoadingToImages(html)
  return html
}

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
  silent: true,
  renderer,
})

export default function MessageContent({
  content,
  isUser,
  userName,
  isStreaming = false,
  messageId,
  chatId,
}: MessageContentProps) {
  const activeCharacterId = useStore((s) => s.activeCharacterId)
  const characters = useStore((s) => s.characters)

  const charName = useMemo(
    () => characters.find((c) => c.id === activeCharacterId)?.name ?? 'Assistant',
    [characters, activeCharacterId],
  )
  const interceptorRegistryVersion = useSyncExternalStore(
    subscribeTagInterceptorRegistry,
    getTagInterceptorRegistryVersion,
    getTagInterceptorRegistryVersion,
  )
  const interceptorCleanedContent = useMemo(
    () => stripAndDispatchMessageTags(content, { messageId, chatId, isUser, isStreaming }),
    [content, messageId, chatId, isUser, isStreaming, interceptorRegistryVersion],
  )
  const resolvedContent = useMemo(
    () => resolveDisplayMacros(interceptorCleanedContent, { charName, userName }),
    [interceptorCleanedContent, charName, userName],
  )

  const blocks = useMemo(() => parseOOC(resolvedContent), [resolvedContent])
  const oocEnabled = useStore((s) => s.oocEnabled)
  const lumiaOOCStyle = useStore((s) => s.lumiaOOCStyle)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevTextLenRef = useRef(0)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const handleLightboxClose = useCallback(() => setLightboxSrc(null), [])

  // Attach click handler for images with data-lightbox
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest('img[data-lightbox], .prose img') as HTMLImageElement | null
      if (img?.src) setLightboxSrc(img.src)
    }
    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [])

  const renderedBlocks = useMemo(() => {
    const elements: React.ReactNode[] = []
    let oocIndex = 0

    // For IRC mode, gather ALL OOC blocks into one grouped chat room
    // rendered at the position of the last OOC block
    if (lumiaOOCStyle === 'irc' && oocEnabled) {
      const allIrcEntries: IrcEntry[] = []
      let lastOocIndex = -1

      // First pass: collect all OOC entries and find last OOC position
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].type === 'ooc') {
          allIrcEntries.push({ name: blocks[i].name || '', content: blocks[i].content })
          lastOocIndex = i
        }
      }

      // Second pass: render text blocks normally, insert grouped chat room at last OOC position
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (block.type === 'ooc') {
          // Render the grouped chat room after the last OOC block
          if (i === lastOocIndex && allIrcEntries.length > 0) {
            elements.push(
              <OOCIrcChatRoom key={`irc-${i}`} entries={allIrcEntries} />
            )
          }
          // Otherwise skip — OOC content is hidden until rendered in the grouped box
        } else {
          const html = formatContent(block.content)
          elements.push(
            <div key={i} className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
          )
        }
      }
    } else {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (block.type === 'ooc') {
          if (!oocEnabled) continue
          elements.push(
            <OOCBlockComponent key={i} content={block.content} name={block.name} index={oocIndex} />
          )
          oocIndex++
        } else {
          const html = formatContent(block.content)
          elements.push(
            <div key={i} className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
          )
        }
      }
    }

    return elements
  }, [blocks, oocEnabled, lumiaOOCStyle])

  // Chunk fade animation for streaming tokens
  useLayoutEffect(() => {
    if (!isStreaming || !containerRef.current) {
      prevTextLenRef.current = content.length
      return
    }

    const container = containerRef.current
    const currentLen = content.length
    const prevLen = prevTextLenRef.current

    if (currentLen <= prevLen) {
      prevTextLenRef.current = currentLen
      return
    }

    // Walk text nodes and wrap new content
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let charCount = 0
    const nodesToWrap: { node: Text; start: number; end: number }[] = []

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      const nodeLen = textNode.length
      const nodeStart = charCount
      const nodeEnd = charCount + nodeLen

      if (nodeEnd > prevLen) {
        const start = Math.max(0, prevLen - nodeStart)
        nodesToWrap.push({ node: textNode, start, end: nodeLen })
      }

      charCount += nodeLen
    }

    for (const { node, start, end } of nodesToWrap) {
      if (start === 0 && end === node.length) {
        // Wrap entire node
        const span = document.createElement('span')
        span.className = styles.chunkFade
        node.parentNode?.insertBefore(span, node)
        span.appendChild(node)
      } else if (start < end) {
        // Split and wrap only new portion
        const newPart = node.splitText(start)
        const span = document.createElement('span')
        span.className = styles.chunkFade
        newPart.parentNode?.insertBefore(span, newPart)
        span.appendChild(newPart)
      }
    }

    prevTextLenRef.current = currentLen
  }, [content, isStreaming])

  return (
    <>
      <div
        ref={containerRef}
        className={clsx(styles.content, isUser ? styles.contentUser : styles.contentChar)}
      >
        {renderedBlocks}
      </div>
      <ImageLightbox src={lightboxSrc} onClose={handleLightboxClose} />
    </>
  )
}
