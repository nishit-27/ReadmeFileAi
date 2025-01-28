import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import 'github-markdown-css'
import './App.css'

function App() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [readme, setReadme] = useState(null)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState('preview') // 'preview' or 'raw'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setReadme(null)
    
    try {
      const response = await fetch('http://localhost:3000/generate-readme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repoUrl }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate README')
      }

      setReadme(data.readme)
    } catch (err) {
      console.error('Error:', err)
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(readme)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="container">
      <h1>README Generator</h1>
      <p className="description">
        Transform your GitHub repository into a comprehensive README file using AI.
        Just paste your repository URL below and let the magic happen.
      </p>

      <form onSubmit={handleSubmit} className="form">
        <div className="input-wrapper">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="Enter GitHub repository URL (e.g., https://github.com/username/repo)"
            className="input"
            required
            disabled={loading}
          />
          {loading && <div className="input-overlay" />}
        </div>
        <button type="submit" disabled={loading} className="button">
          {loading ? (
            <span className="loading">Generating README...</span>
          ) : (
            'Generate README'
          )}
        </button>
      </form>

      {error && (
        <div className="error">
          <span>⚠️ Error: {error}</span>
        </div>
      )}

      {readme && (
        <div className="result">
          <h2>Generated README</h2>
          
          <div className="view-toggle">
            <button 
              className={`toggle-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
            >
              Preview
            </button>
            <button 
              className={`toggle-btn ${viewMode === 'raw' ? 'active' : ''}`}
              onClick={() => setViewMode('raw')}
            >
              Raw
            </button>
          </div>

          {viewMode === 'preview' ? (
            <div className="markdown-preview markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {readme}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="readme-content">{readme}</pre>
          )}

          <div className="button-group">
            <button
              onClick={handleCopy}
              className="copy-button"
            >
              {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
            </button>
            <button
              onClick={() => {
                const blob = new Blob([readme], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'README.md';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="download-button"
            >
              💾 Download README.md
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
