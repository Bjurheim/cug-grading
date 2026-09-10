import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { fields, PAGE_SIZE, serialText, type Api, type Card, type LibraryInfo, type Result, type Setup } from '../shared/contracts'
import { Autosave, type SaveState } from './autosave'
import './style.css'
declare global { interface Window { cards: Api } }
const unwrap = <T,>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error); return result.value }
function App(): React.JSX.Element {
  const [info, setInfo] = useState<LibraryInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Card | null>(null)
  const [settings, setSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState('')
  const editor = useRef<Autosave | null>(null)
  const actionLock = useRef(false)
  async function refresh(page = offset): Promise<void> {
    const result = unwrap(await window.cards.list(page))
    setCards(result.cards); setTotal(result.total); setOffset(page)
  }
  useEffect(() => {
    void (async () => {
      try { const data = unwrap(await window.cards.info()); setInfo(data); if (data) { setSettings(!data.allocation); await refresh(0) } }
      catch (e) { setError(String(e)) } finally { setReady(true) }
    })()
    return window.cards.onFlush(async () => !editor.current || await editor.current.flush())
  }, [])
  async function act(fn: () => Promise<void>): Promise<void> {
    if (actionLock.current) return
    actionLock.current = true; setBusy(true); setError('')
    try { if (editor.current && !await editor.current.flush()) return; await fn() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { actionLock.current = false; setBusy(false) }
  }
  function open(card: Card): void {
    editor.current = new Autosave(card, async (id, revision, metadata) => unwrap(await window.cards.save(id, revision, metadata)), (state, message) => {
      setSaveState(state); setSaveError(message ?? '')
      if (state === 'saved' && editor.current) {
        const saved = editor.current.card
        setCards(previous => previous.map(row => row.id === saved.id ? saved : row))
      }
    })
    setSelected(card); setSaveState('saved'); setSaveError(''); setSettings(false)
  }
  async function choose(create: boolean): Promise<void> {
    const data = unwrap(await window.cards.chooseLibrary(create))
    if (!data) return
    editor.current = null; setSelected(null); setInfo(data); setSettings(!data.allocation); await refresh(0)
  }
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">▱</span><div>CARDS<br/><strong>UNDER GLASS</strong></div></div>
      <div className="eyebrow">YOUR WORKSPACE</div>
      <button className={!settings ? 'nav active' : 'nav'} disabled={!info || busy} onClick={() => void act(async () => { setSettings(false); await refresh() })}><span>▤</span> Card library <small>{total}</small></button>
      <button className={settings ? 'nav active' : 'nav'} disabled={!info || busy} onClick={() => void act(async () => { setInfo(unwrap(await window.cards.info())); setSettings(true) })}><span>⚙</span> Library settings</button>
      <div className="sidebar-bottom"><span className="local-dot"/> LOCAL LIBRARY<p>Your collection.<br/>Right here, with you.</p>{info && <div className="folder" title={info.folder}>{info.folder}</div>}</div>
    </aside>
    <main>
      <header><div className="breadcrumb">Workspace <span>/</span> {settings ? 'Settings' : 'Card library'}</div><span className="private-label">◈ &nbsp; Local & private</span></header>
      {error && <div role="alert" className="error">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {!ready ? <div className="welcome"><h1>Opening your workspace…</h1></div> : !info ? <div className="welcome">
        <div className="hero-mark">▱</div><div className="eyebrow">A HOME FOR EVERY CARD</div><h1>A little order.<br/>A closer look.</h1>
        <p>Catalogue your collection in a library you own.<br/>Start with a folder. Add the details at your own pace.</p>
        <div className="actions"><button className="primary" disabled={busy} onClick={() => void act(() => choose(true))}>Create a library</button><button disabled={busy} onClick={() => void act(() => choose(false))}>Open existing library</button></div>
        <small>Choose an empty local folder for a new library.</small>
      </div> : settings ? <Settings key={info.folder + JSON.stringify(info.allocation)} info={info} busy={busy} onSubmit={setup => void act(async () => { setInfo(unwrap(await window.cards.configure(setup))); setSettings(false) })} onChoose={create => void act(() => choose(create))}/> : <>
        <div className="page-heading"><div><div className="eyebrow">THE COLLECTION</div><h1>Card library <span className="count">{total}</span></h1><p>Every card has a place. The details can come later.</p></div><button className="primary" disabled={busy || !info.allocation} onClick={() => void act(async () => { open(unwrap(await window.cards.create())); setInfo(unwrap(await window.cards.info())); await refresh(0) })}>＋ New card</button></div>
        {!info.allocation && <div className="notice">Set up this workstation’s serial allocation in Library settings before creating cards.</div>}
        <div className={selected ? 'collection with-editor' : 'collection'}>
          <section className="list-panel"><div className="panel-heading"><strong>All cards</strong><span>List view</span></div>
            {cards.length === 0 ? <div className="empty"><div>▱</div><h2>Your collection starts here</h2><p>Create a card to give it a permanent serial.<br/>All identification details are optional.</p></div> : <div className="table-wrap"><table><thead><tr><th>Serial / Card</th><th>Game / Set</th><th>Status / Updated</th></tr></thead><tbody>{cards.map(card => <tr key={card.id} className={selected?.id === card.id ? 'selected' : ''}>
              <td><button className="card-link" disabled={busy} onClick={() => void act(async () => { const result = unwrap(await window.cards.list(offset)); const fresh = result.cards.find(c => c.id === card.id) ?? card; open(fresh) })}><span className="serial">{card.serial}</span><strong>{card.cardName || 'Unnamed Card'}</strong></button></td>
              <td><span>{card.game || '—'}</span><small>{card.setName || '—'}</small></td><td><span className="status">In Progress</span><small>{new Date(card.updatedAt).toLocaleDateString()}</small></td>
            </tr>)}</tbody></table></div>}
            <div className="pagination"><span>{total ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}` : '0 cards'}</span><div><button disabled={busy || offset === 0} onClick={() => void act(() => refresh(Math.max(0, offset - PAGE_SIZE)))}>Previous</button><button disabled={busy || offset + PAGE_SIZE >= total} onClick={() => void act(() => refresh(offset + PAGE_SIZE))}>Next</button></div></div>
          </section>
          {selected && <section className="editor"><div className="editor-heading"><div><div className="eyebrow">CARD DETAILS</div><h2 className="serial">{selected.serial}</h2></div><button aria-label="Close card" disabled={busy} onClick={() => void act(async () => { editor.current = null; setSelected(null); await refresh() })}>×</button></div>
            <div className="editor-tabs"><span>Metadata</span><button disabled title="Coming in a later milestone">Inspection</button><button disabled title="Coming in a later milestone">Photos</button></div>
            <div className="save-line" role="status"><span className="status">In Progress</span><span className={saveState === 'error' ? 'save-error' : ''}>{({ saved: '✓ All changes saved', saving: 'Saving…', unsaved: 'Unsaved changes…', error: 'Save failed' })[saveState]}</span></div>
            {saveError && <div role="alert" className="error">{saveError}<button onClick={() => void editor.current?.flush()}>Retry save</button></div>}
            <p className="form-hint">All fields are optional. Changes save automatically.</p>
            <fieldset disabled={busy} className="metadata-grid">{(Object.keys(fields) as (keyof typeof fields)[]).map(key => <label className={key === 'notes' || key === 'cardName' ? 'wide' : ''} key={key}>{fields[key]}{key === 'submittedBy' && <small className="internal">PRIVATE</small>}{key === 'notes' ? <textarea aria-label={fields[key]} maxLength={20000} rows={4} value={selected[key] ?? ''} onChange={event => { editor.current!.edit(key, event.target.value); setSelected({ ...editor.current!.card }) }}/> : <input aria-label={fields[key]} maxLength={20000} value={selected[key] ?? ''} onChange={event => { editor.current!.edit(key, event.target.value); setSelected({ ...editor.current!.card }) }}/>}</label>)}</fieldset>
            <div className="editor-foot">This serial is permanent. You can return to this card any time.</div>
          </section>}
        </div>
      </>}
    </main>
  </div>
}
function Settings({ info, busy, onSubmit, onChoose }: { info: LibraryInfo; busy: boolean; onSubmit: (s: Setup) => void; onChoose: (create: boolean) => void }): React.JSX.Element {
  const [name, setName] = useState(info.installationName || 'My workstation')
  const [start, setStart] = useState(serialText(info.allocation?.start ?? 1))
  const [end, setEnd] = useState(serialText(info.allocation?.end ?? 50000))
  const [next, setNext] = useState(serialText(info.allocation?.next ?? 1))
  return <div className="settings"><div className="eyebrow">MAKE YOURSELF AT HOME</div><h1>{info.allocation ? 'Library settings' : 'Set up your workstation'}</h1><p>Give this installation a name and its own range of permanent serials.</p>
    <form onSubmit={event => { event.preventDefault(); onSubmit({ name, start: Number(start), end: Number(end), next: Number(next) }) }}>
      <fieldset disabled={busy}><label>Workstation name<input required maxLength={200} value={name} onChange={e => setName(e.target.value)}/></label>
      <div className="settings-range"><label>First serial<input required inputMode="numeric" pattern="[0-9]{1,10}" value={start} onChange={e => setStart(e.target.value)}/></label><label>Last serial<input required inputMode="numeric" pattern="[0-9]{1,10}" value={end} onChange={e => setEnd(e.target.value)}/></label><label>Next serial<input required inputMode="numeric" pattern="[0-9]{1,10}" value={next} onChange={e => setNext(e.target.value)}/></label></div>
      <div className="notice">The usual range is 50,000 serials per installation. Use distinct ranges for different installations. Changes apply to future cards; existing serials never change.</div>
      <button className="primary" type="submit">Save allocation</button></fieldset>
    </form>
    {info.history.length > 0 && <section className="range-history"><h2>Allocation history</h2>{info.history.map(a => <div key={a.id}><span className="serial">{serialText(a.start)} – {serialText(a.end)}</span><span>{a.retiredAt ? 'Retired' : a.next > a.end ? 'Exhausted' : 'Current'}</span></div>)}</section>}
    <section className="library-location"><h2>Library folder</h2><p>{info.folder}</p><div className="actions"><button disabled={busy} onClick={() => onChoose(false)}>Open another library</button><button disabled={busy} onClick={() => onChoose(true)}>Create another library</button></div></section>
  </div>
}
createRoot(document.getElementById('root')!).render(<App/> )
