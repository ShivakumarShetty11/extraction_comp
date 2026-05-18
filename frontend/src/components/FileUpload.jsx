import { useRef, useState } from 'react'

export default function FileUpload({ onUpload, loading }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const accept = (file) => {
    if (file && /\.(xlsx|xls)$/i.test(file.name)) onUpload(file)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => accept(e.target.files[0])}
        disabled={loading}
      />
      <button
        className={`upload-btn${dragging ? ' upload-btn-drag' : ''}`}
        disabled={loading}
        onClick={() => !loading && inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          accept(e.dataTransfer.files[0])
        }}
      >
        {loading ? (
          <>&#8987; Processing…</>
        ) : (
          <>&#128193; Upload Excel (.xlsx)</>
        )}
      </button>
    </>
  )
}
