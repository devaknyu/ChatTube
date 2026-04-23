export default function NotesPanel({ notes, onDelete, onUpdate }) {
  function handleDownload() {
    const md = notes
      .map((n, i) => `## Note ${i + 1}${n.source ? ` — ${n.source}` : ''}\n\n${n.text}`)
      .join('\n\n---\n\n')

    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'chattube-notes.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
        <span className="text-sm text-gray-400">
          {notes.length} note{notes.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={handleDownload}
          disabled={notes.length === 0}
          className="text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40
                     disabled:cursor-not-allowed border border-gray-700 rounded-lg
                     px-3 py-1.5 text-gray-300 transition-colors"
        >
          ↓ Download .md
        </button>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {notes.length === 0 && (
          <p className="text-gray-600 text-sm text-center mt-8">
            Pin messages or study content with 📌 to add notes
          </p>
        )}

        {notes.map(note => (
          <div key={note.id} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            {/* Source label + delete */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 bg-gray-800/50">
              <span className="text-xs text-gray-500">{note.source || 'Note'}</span>
              <button
                onClick={() => onDelete(note.id)}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                title="Delete note"
              >
                ✕
              </button>
            </div>
            {/* Editable textarea — grows to fit content, no own scrollbar */}
            <textarea
              value={note.text}
              onChange={e => {
                onUpdate(note.id, e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              ref={el => {
                if (el) {
                  el.style.height = 'auto'
                  el.style.height = el.scrollHeight + 'px'
                }
              }}
              className="w-full bg-transparent text-sm text-gray-200 leading-relaxed
                         px-3 py-2.5 resize-none focus:outline-none overflow-hidden"
              style={{ minHeight: '80px' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
