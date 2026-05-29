import { useRealtimeStatus } from '../context/RealtimeStatusContext'
import './ConnectionStatus.css'

/** Formata timestamps internos do status para leitura humana. */
function formatTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

/** Tela de diagnóstico para entender se o Realtime/Supabase está conectado. */
export function ConnectionStatus() {
  const status = useRealtimeStatus()
  const mode = status.remote ? 'Supabase online' : 'Local'
  const network = status.online ? 'Online' : 'Offline'

  return (
    <div className="connection-status">
      <header className="connection-status__head">
        <span className={`connection-status__signal connection-status__signal--${status.state}`} aria-hidden />
        <div>
          <h1 className="connection-status__title">Status da conexão</h1>
          <p className="connection-status__lead">{status.detail}</p>
        </div>
      </header>

      <dl className="connection-status__grid">
        <div className="connection-status__card">
          <dt>Realtime</dt>
          <dd>{status.label}</dd>
        </div>
        <div className="connection-status__card">
          <dt>Modo</dt>
          <dd>{mode}</dd>
        </div>
        <div className="connection-status__card">
          <dt>Rede</dt>
          <dd>{network}</dd>
        </div>
        <div className="connection-status__card">
          <dt>Última mudança</dt>
          <dd>{formatTime(status.lastChangedAt)}</dd>
        </div>
      </dl>
    </div>
  )
}
