import { createContext, useContext, useEffect, useState } from 'react'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)

  function confirm(message) {
    return new Promise((resolve) => {
      setDialog({ message, resolve })
    })
  }

  function closeDialog(result) {
    if (!dialog) return

    dialog.resolve(result)
    setDialog(null)
  }

  useEffect(() => {
    if (!dialog) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeDialog(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialog])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog ? (
        <div className="confirm-modal-overlay" onClick={() => closeDialog(false)}>
          <section
            className="confirm-modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-message"
            onClick={(event) => event.stopPropagation()}
          >
            <p id="confirm-modal-message">{dialog.message}</p>
            <div className="confirm-modal-actions">
              <button type="button" onClick={() => closeDialog(false)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={() => closeDialog(true)} className="btn-primary">Confirm</button>
            </div>
          </section>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)

  if (!confirm) {
    throw new Error('useConfirm must be used within a ConfirmProvider.')
  }

  return confirm
}
