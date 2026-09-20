import { useEffect, useMemo, useState } from 'react'
import ReceiptModal from '../components/ReceiptModal'
import api from '../api/client'

function getToday() {
  const currentDate = new Date()
  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getListData(data) {
  return Array.isArray(data) ? data : data.results || []
}

function formatFareType(fareType) {
  if (fareType === 'discount') return 'Discount'
  if (fareType === 'base') return 'Regular'
  return '-'
}

function TransactionHistoryPage() {
  const [date, setDate] = useState(getToday())
  const [searchText, setSearchText] = useState('')
  const [transactions, setTransactions] = useState([])
  const [receiptId, setReceiptId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setError('')

    api.get('tap-log/recent/', { params: { date, source: 'all' } })
      .then((response) => {
        if (isMounted) setTransactions(getListData(response.data))
      })
      .catch((requestError) => {
        if (isMounted) {
          setTransactions([])
          setError(requestError.response?.data?.error || 'Could not load transaction history.')
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [date])

  const visibleTransactions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return transactions
      .filter((transaction) => transaction.success === true)
      .filter((transaction) => {
        if (!normalizedSearch) return true
        return [transaction.passenger_name, transaction.card_uid]
          .some((value) => String(value || '').toLowerCase().includes(normalizedSearch))
      })
  }, [searchText, transactions])

  return (
    <div style={{ width: '100%', maxWidth: '1280px', margin: '40px auto', padding: '0 24px', fontFamily: 'var(--font-body)' }}>
      <h1>Transaction History</h1>
      <div style={{ display: 'flex', alignItems: 'end', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="transaction-history-date">Date</label>
          <input
            id="transaction-history-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="input"
            style={{ display: 'block', marginTop: '4px' }}
          />
        </div>
        <div style={{ flex: '1 1 260px' }}>
          <label htmlFor="transaction-history-search">Search passenger or card UID</label>
          <input
            id="transaction-history-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by name or card UID"
            className="input"
            style={{ display: 'block', width: '100%', marginTop: '4px' }}
          />
        </div>
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {isLoading ? <p>Loading transactions...</p> : null}
      {!isLoading && !error && visibleTransactions.length === 0 ? <p>No transactions found.</p> : null}
      {!isLoading && visibleTransactions.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Passenger</th>
                <th>Destination</th>
                <th>Fare Type</th>
                <th>Fare Charged</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{new Date(transaction.timestamp).toLocaleString()}</td>
                  <td>{transaction.passenger_name || (transaction.source === 'manual' ? 'Cash' : transaction.card_uid || '-')}</td>
                  <td>{transaction.destination_name || '-'}</td>
                  <td>{formatFareType(transaction.fare_type)}</td>
                  <td className="numeric">{transaction.fare_charged ?? '-'}</td>
                  <td><button type="button" onClick={() => setReceiptId(transaction.id)} className="btn-primary">Print Boarding Confirmation</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ReceiptModal tapLogId={receiptId} onClose={() => setReceiptId(null)} />
    </div>
  )
}

export default TransactionHistoryPage
