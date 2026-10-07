import { useEffect } from 'react'

export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title
    document.title = title ? `${title} · LIMOZ Fleet` : 'LIMOZ Fleet'
    return () => {
      document.title = previous
    }
  }, [title])
}
