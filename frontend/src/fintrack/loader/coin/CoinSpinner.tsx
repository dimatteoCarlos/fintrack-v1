import './coin_loader.css'

// The coin is decorative and the only thing on screen during a fetch: role='status' and the hidden
// word give screen readers the announcement, since call sites pass no props.
const CoinSpinner = () => {
  return (
    <div role='status' aria-busy='true'>
      <span className='loader' aria-hidden='true'></span>
      <span className='loader__label'>Loading</span>
    </div>
  )
}

export default CoinSpinner
