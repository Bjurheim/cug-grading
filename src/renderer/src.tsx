import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  fields, gradeFields, PAGE_SIZE, photoMediaUrl, photoSlots, serialText,
  type Api, type Card, type CardDetail, type DefectMarker, type GradeField,
  type LibraryInfo, type MeasurementField, type Metadata, type Photo,
  type NoteField, type PrimaryPhotoSlot, type Result, type Setup
} from '../shared/contracts'
import { apparentSkew, centeringRatio, formatGrade, formatMeasurement, parseFixedInput } from '../shared/inspection'
import { CardAutosave, type SaveState } from './autosave'
import './style.css'

declare global { interface Window { cards: Api } }
const unwrap = <T,>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error); return result.value }
const stateLabel = (card: Card): string => ({ in_progress: 'In Progress', finalized: 'Finalized', changes_pending: 'Finalized — changes pending' })[card.finalizationState]

function App(): React.JSX.Element {
  const [info, setInfo] = useState<LibraryInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<CardDetail | null>(null)
  const [section, setSection] = useState<'overview' | 'inspection' | 'photos'>('overview')
  const [settings, setSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState('')
  const editor = useRef<CardAutosave | null>(null)
  const actionLock = useRef(false)

  async function refresh(page = offset): Promise<void> {
    const result = unwrap(await window.cards.list(page))
    setCards(result.cards); setTotal(result.total); setOffset(page)
  }

  useEffect(() => {
    void (async () => {
      try { const data = unwrap(await window.cards.info()); setInfo(data); if (data) { setSettings(!data.allocation); await refresh(0) } }
      catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) } finally { setReady(true) }
    })()
    return window.cards.onFlush(async () => !editor.current || await editor.current.flush())
  }, [])

  async function act(action: () => Promise<void>): Promise<void> {
    if (actionLock.current) return
    actionLock.current = true; setBusy(true); setError('')
    try { if (editor.current && !await editor.current.flush()) return; await action() }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { actionLock.current = false; setBusy(false) }
  }

  function installEditor(detail: CardDetail, nextSection: 'overview' | 'inspection' | 'photos' = 'overview'): void {
    const next = new CardAutosave(detail, {
      metadata: async (id, revision, metadata) => unwrap(await window.cards.save(id, revision, metadata)),
      inspection: async (id, revision, inspection) => unwrap(await window.cards.saveInspection(id, revision, inspection)),
      marker: async (id, note) => unwrap(await window.cards.saveMarker(id, note)),
      photo: async (id, title) => unwrap(await window.cards.savePhotoTitle(id, title))
    }, (state, message) => { setSaveState(state); setSaveError(message ?? '') }, changed => {
      setSelected({ ...changed, card: { ...changed.card }, inspection: { ...changed.inspection }, markers: [...changed.markers], photos: [...changed.photos] })
      setCards(previous => previous.map(card => card.id === changed.card.id ? changed.card : card))
    })
    editor.current = next
    setSelected(detail); setSection(nextSection); setSaveState('saved'); setSaveError(''); setSettings(false)
  }

  async function openCard(id: string, nextSection: 'overview' | 'inspection' | 'photos' = 'overview'): Promise<void> {
    installEditor(unwrap(await window.cards.get(id)), nextSection)
  }

  async function choose(create: boolean): Promise<void> {
    const data = unwrap(await window.cards.chooseLibrary(create))
    if (!data) return
    editor.current = null; setSelected(null); setInfo(data); setSettings(!data.allocation); await refresh(0)
  }

  async function addMarker(side: DefectMarker['side'], x: number, y: number): Promise<void> {
    if (!selected) return
    const marker = unwrap(await window.cards.addMarker(selected.card.id, side, x, y))
    const detail = { ...editor.current!.detail, markers: [...editor.current!.detail.markers, marker] }
    editor.current!.replace(detail)
  }

  async function removeMarker(id: string): Promise<void> {
    await window.cards.removeMarker(id).then(unwrap)
    editor.current!.replace({ ...editor.current!.detail, markers: editor.current!.detail.markers.filter(marker => marker.id !== id) })
  }

  async function choosePhotos(slot: PrimaryPhotoSlot | null): Promise<void> {
    if (!selected) return
    const detail = unwrap(await window.cards.choosePhotos(selected.card.id, slot))
    if (detail) editor.current!.replace(detail)
  }

  async function importDroppedPhotos(slot: PrimaryPhotoSlot | null, files: File[]): Promise<void> {
    if (!selected || !files.length) return
    editor.current!.replace(unwrap(await window.cards.importDroppedPhotos(selected.card.id, slot, files)))
  }

  async function setPhotoLocked(id: string, locked: boolean): Promise<void> {
    editor.current!.replace(unwrap(await window.cards.setPhotoLocked(id, locked)))
  }

  async function setPhotoMarkers(id: string, markerIds: string[]): Promise<void> {
    editor.current!.replace(unwrap(await window.cards.setPhotoMarkers(id, markerIds)))
  }

  async function removePhoto(id: string): Promise<void> {
    editor.current!.replace(unwrap(await window.cards.removePhoto(id)))
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">▱</span><div>CARDS<br/><strong>UNDER GLASS</strong></div></div>
      <div className="eyebrow">YOUR WORKSPACE</div>
      <button className={!settings ? 'nav active' : 'nav'} disabled={!info || busy} onClick={() => void act(async () => { setSettings(false); editor.current = null; setSelected(null); await refresh() })}><span>▤</span> Card library <small>{total}</small></button>
      <button className={settings ? 'nav active' : 'nav'} disabled={!info || busy} onClick={() => void act(async () => { setInfo(unwrap(await window.cards.info())); editor.current = null; setSelected(null); setSettings(true) })}><span>⚙</span> Library settings</button>
      <div className="sidebar-bottom"><span className="local-dot"/> LOCAL LIBRARY<p>Your collection.<br/>Right here, with you.</p>{info && <div className="folder" title={info.folder}>{info.folder}</div>}</div>
    </aside>
    <main>
      <header><div className="breadcrumb">Workspace <span>/</span> {settings ? 'Settings' : selected ? selected.card.serial : 'Card library'}</div><span className="private-label">◈ &nbsp; Local & private</span></header>
      {error && <div role="alert" className="error global-error">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {!ready ? <div className="welcome"><h1>Opening your workspace…</h1></div> : !info ? <Welcome busy={busy} choose={create => void act(() => choose(create))}/> : settings ?
        <Settings key={info.folder + JSON.stringify(info.allocation)} info={info} busy={busy} onSubmit={setup => void act(async () => { setInfo(unwrap(await window.cards.configure(setup))); setSettings(false) })} onChoose={create => void act(() => choose(create))}/> : <>
          <div className="page-heading"><div><div className="eyebrow">THE COLLECTION</div><h1>Card library <span className="count">{total}</span></h1><p>Every card has a place. The details can come later.</p></div><button className="primary" disabled={busy || !info.allocation} onClick={() => void act(async () => { installEditor(unwrap(await window.cards.create())); setInfo(unwrap(await window.cards.info())); await refresh(0) })}>＋ New card</button></div>
          {!info.allocation && <div className="notice">Set up this workstation’s serial allocation in Library settings before creating cards.</div>}
          <div className={selected ? 'collection with-editor' : 'collection'}>
            <CardList cards={cards} total={total} offset={offset} busy={busy} selected={selected?.card.id} open={id => void act(() => openCard(id))} page={page => void act(() => refresh(page))}/>
            {selected && <CardEditor detail={selected} section={section} busy={busy} saveState={saveState} saveError={saveError}
              editor={editor.current!} setSection={next => void act(async () => setSection(next))}
              close={() => void act(async () => { editor.current = null; setSelected(null); await refresh() })}
              retry={() => void editor.current?.flush()}
              setPublic={include => void act(async () => { const card = unwrap(await window.cards.setIncludePublic(selected.card.id, editor.current!.detail.card.revision, include)); editor.current!.replace({ ...editor.current!.detail, card }) })}
              finalize={() => void act(async () => { setSection('inspection'); editor.current!.replace(unwrap(await window.cards.finalize(selected.card.id, editor.current!.detail.card.revision))); await refresh(offset) })}
              deleteCard={() => void act(async () => { await window.cards.delete(selected.card.id).then(unwrap); editor.current = null; setSelected(null); await refresh(Math.max(0, Math.min(offset, Math.floor(Math.max(total - 2, 0) / PAGE_SIZE) * PAGE_SIZE))) })}
              addMarker={(side, x, y) => void act(() => addMarker(side, x, y))}
              removeMarker={id => void act(() => removeMarker(id))}
              choosePhotos={slot => void act(() => choosePhotos(slot))}
              importDroppedPhotos={(slot, files) => void act(() => importDroppedPhotos(slot, files))}
              setPhotoLocked={(id, locked) => void act(() => setPhotoLocked(id, locked))}
              setPhotoMarkers={(id, markerIds) => void act(() => setPhotoMarkers(id, markerIds))}
              removePhoto={id => void act(() => removePhoto(id))}/>}
          </div>
        </>}
    </main>
  </div>
}

function Welcome({ busy, choose }: { busy: boolean; choose: (create: boolean) => void }): React.JSX.Element {
  return <div className="welcome"><div className="hero-mark">▱</div><div className="eyebrow">A HOME FOR EVERY CARD</div><h1>A little order.<br/>A closer look.</h1><p>Catalogue your collection in a library you own.<br/>Start with a folder. Add the details at your own pace.</p><div className="actions"><button className="primary" disabled={busy} onClick={() => choose(true)}>Create a library</button><button disabled={busy} onClick={() => choose(false)}>Open existing library</button></div><small>Choose an empty local folder for a new library.</small></div>
}

function CardList({ cards, total, offset, busy, selected, open, page }: { cards: Card[]; total: number; offset: number; busy: boolean; selected?: string; open: (id: string) => void; page: (offset: number) => void }): React.JSX.Element {
  return <section className="list-panel"><div className="panel-heading"><strong>All cards</strong><span>List view</span></div>
    {cards.length === 0 ? <div className="empty"><div>▱</div><h2>Your collection starts here</h2><p>Create a card to give it a permanent serial.<br/>All identification details are optional.</p></div> : <div className="table-wrap"><table><thead><tr><th>Serial / Card</th><th>Game / Set</th><th>Grade / Status</th></tr></thead><tbody>{cards.map(card => <tr key={card.id} className={selected === card.id ? 'selected' : ''}>
      <td><button className="card-link" disabled={busy} onClick={() => open(card.id)}><span className="serial">{card.serial}</span><strong>{card.cardName || 'Unnamed Card'}</strong></button></td>
      <td><span>{card.game || '—'}</span><small>{card.setName || '—'}</small></td>
      <td><span>{formatGrade(card.estimatedGrade) || '—'}</span><small><span className={`status ${card.finalizationState}`}>{stateLabel(card)}</span></small></td>
    </tr>)}</tbody></table></div>}
    <div className="pagination"><span>{total ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}` : '0 cards'}</span><div><button disabled={busy || offset === 0} onClick={() => page(Math.max(0, offset - PAGE_SIZE))}>Previous</button><button disabled={busy || offset + PAGE_SIZE >= total} onClick={() => page(offset + PAGE_SIZE)}>Next</button></div></div>
  </section>
}

interface CardEditorProps {
  detail: CardDetail; section: 'overview' | 'inspection' | 'photos'; busy: boolean; saveState: SaveState; saveError: string; editor: CardAutosave
  setSection: (section: 'overview' | 'inspection' | 'photos') => void; close: () => void; retry: () => void
  setPublic: (include: boolean) => void; finalize: () => void; deleteCard: () => void
  addMarker: (side: DefectMarker['side'], x: number, y: number) => void; removeMarker: (id: string) => void
  choosePhotos: (slot: PrimaryPhotoSlot | null) => void; importDroppedPhotos: (slot: PrimaryPhotoSlot | null, files: File[]) => void
  setPhotoLocked: (id: string, locked: boolean) => void; setPhotoMarkers: (id: string, markerIds: string[]) => void; removePhoto: (id: string) => void
}

function CardEditor(props: CardEditorProps): React.JSX.Element {
  const { detail, editor } = props
  return <section className="editor"><div className="editor-heading"><div><div className="eyebrow">CARD WORKSPACE</div><h2><span className="serial">{detail.card.serial}</span><span className="card-identity">{detail.card.cardName || 'Unnamed Card'}</span></h2></div><button aria-label="Close card" disabled={props.busy} onClick={props.close}>×</button></div>
    <div className="editor-tabs"><button className={props.section === 'overview' ? 'active' : ''} onClick={() => props.setSection('overview')}>Overview</button><button className={props.section === 'inspection' ? 'active' : ''} onClick={() => props.setSection('inspection')}>Inspection</button><button className={props.section === 'photos' ? 'active' : ''} onClick={() => props.setSection('photos')}>Photos</button></div>
    <div className="save-line" role="status"><span className={`status ${detail.card.finalizationState}`}>{stateLabel(detail.card)}</span><span className={props.saveState === 'error' ? 'save-error' : ''}>{({ saved: '✓ All changes saved', saving: 'Saving…', unsaved: 'Unsaved changes…', error: 'Save failed' })[props.saveState]}</span></div>
    {props.saveError && <div role="alert" className="error">{props.saveError}<button onClick={props.retry}>Retry save</button></div>}
    {props.section === 'overview' ? <Overview detail={detail} editor={editor} busy={props.busy} setPublic={props.setPublic} deleteCard={props.deleteCard}/> : props.section === 'inspection' ?
      <InspectionView detail={detail} editor={editor} busy={props.busy} finalize={props.finalize} addMarker={props.addMarker} removeMarker={props.removeMarker}/> :
      <PhotosView detail={detail} editor={editor} busy={props.busy} choose={props.choosePhotos} drop={props.importDroppedPhotos} setLocked={props.setPhotoLocked} setMarkers={props.setPhotoMarkers} remove={props.removePhoto}/>}
  </section>
}

function Overview({ detail, editor, busy, setPublic, deleteCard }: { detail: CardDetail; editor: CardAutosave; busy: boolean; setPublic: (include: boolean) => void; deleteCard: () => void }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  return <><p className="form-hint">All identification fields are optional. Changes save automatically.</p>
    <fieldset disabled={busy} className="metadata-grid">{(Object.keys(fields) as (keyof Metadata)[]).map(key => <label className={key === 'notes' || key === 'cardName' ? 'wide' : ''} key={key}>{fields[key]}{key === 'submittedBy' && <small className="internal">PRIVATE</small>}{key === 'notes' ? <textarea aria-label={fields[key]} maxLength={20000} rows={4} value={detail.card[key] ?? ''} onChange={event => editor.editMetadata(key, event.target.value)}/> : <input aria-label={fields[key]} maxLength={20000} value={detail.card[key] ?? ''} onChange={event => editor.editMetadata(key, event.target.value)}/>}</label>)}</fieldset>
    <div className="card-options"><label className="toggle-row"><input type="checkbox" checked={detail.card.includePublic} onChange={event => setPublic(event.target.checked)}/><span><strong>Include on public site</strong><small>Saved for future site generation. It does not publish this card.</small></span></label></div>
    <div className="danger-zone"><div><strong>Delete card</strong><p>This permanently removes the card, its inspection records, photos, and thumbnails. Its serial stays reserved forever.</p></div><button className="danger" onClick={() => setConfirming(true)}>Delete card…</button></div>
    {confirming && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfirming(false) }}><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="eyebrow">PERMANENT ACTION</div><h2 id="delete-title">Delete {detail.card.serial}?</h2><p>The card, its inspection, notes, defect markers, photos, and thumbnails will be permanently deleted, including locked photos. Serial <span className="serial">{detail.card.serial}</span> will remain reserved and can never be issued again.</p><div className="actions"><button onClick={() => setConfirming(false)}>Keep card</button><button className="danger solid" onClick={deleteCard}>Delete permanently</button></div></div></div>}
    <div className="editor-foot">This serial is permanent. You can return to this card any time.</div></>
}

const gradeNotes: Record<GradeField, NoteField> = { centeringGrade: 'centeringNote', cornersGrade: 'cornersNote', edgesGrade: 'edgesNote', surfaceGrade: 'surfaceNote', estimatedGrade: 'estimatedNote' }
const measurementPairs: { label: string; direction: string; first: MeasurementField; second: MeasurementField; firstLabel: string; secondLabel: string }[] = [
  { label: 'Vertical Left', direction: 'Top / Bottom', first: 'verticalLeftTop', second: 'verticalLeftBottom', firstLabel: 'Top Left', secondLabel: 'Bottom Left' },
  { label: 'Vertical Right', direction: 'Top / Bottom', first: 'verticalRightTop', second: 'verticalRightBottom', firstLabel: 'Top Right', secondLabel: 'Bottom Right' },
  { label: 'Horizontal Upper', direction: 'Left / Right', first: 'horizontalUpperLeft', second: 'horizontalUpperRight', firstLabel: 'Upper Left', secondLabel: 'Upper Right' },
  { label: 'Horizontal Lower', direction: 'Left / Right', first: 'horizontalLowerLeft', second: 'horizontalLowerRight', firstLabel: 'Lower Left', secondLabel: 'Lower Right' }
]

function InspectionView({ detail, editor, busy, finalize, addMarker, removeMarker }: { detail: CardDetail; editor: CardAutosave; busy: boolean; finalize: () => void; addMarker: (side: DefectMarker['side'], x: number, y: number) => void; removeMarker: (id: string) => void }): React.JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(Object.keys(gradeFields).map(key => [key, formatGrade(detail.inspection[key as GradeField])])),
    ...Object.fromEntries(measurementPairs.flatMap(pair => [pair.first, pair.second]).map(key => [key, formatMeasurement(detail.inspection[key])]))
  }))
  const [invalid, setInvalid] = useState<Record<string, boolean>>({})
  const [inputError, setInputError] = useState('')
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null)
  const hasInvalidMeasurement = measurementPairs.some(pair => invalid[pair.first] || invalid[pair.second])
  const skew = hasInvalidMeasurement ? { state: 'unavailable' as const } : apparentSkew(detail.inspection)

  function changeNumeric(key: GradeField | MeasurementField, value: string, decimals: 1 | 2): void {
    setDrafts(current => ({ ...current, [key]: value }))
    const parsed = parseFixedInput(value, decimals, decimals === 1 ? 10 : undefined)
    setInvalid(current => ({ ...current, [key]: !parsed.valid }))
    if (parsed.valid) { setInputError(''); editor.editInspection(key, parsed.value) }
  }
  function commitNumeric(key: GradeField | MeasurementField, decimals: 1 | 2): void {
    const parsed = parseFixedInput(drafts[key] ?? '', decimals, decimals === 1 ? 10 : undefined)
    if (!parsed.valid) { setInvalid(current => ({ ...current, [key]: true })); return }
    setDrafts(current => ({ ...current, [key]: decimals === 1 ? formatGrade(parsed.value) : formatMeasurement(parsed.value) }))
  }

  return <div className="inspection-workbench">
    <section className="workbench-section grades"><div className="section-title"><div><div className="eyebrow">ASSESSMENT</div><h3>Grading</h3></div><span>0.0–10.0</span></div>
      <div className="grade-grid">{(Object.keys(gradeFields) as GradeField[]).map(key => <div className={key === 'estimatedGrade' ? 'grade-control estimated' : 'grade-control'} key={key}><label>{gradeFields[key]}<input aria-label={gradeFields[key]} className={invalid[key] ? 'invalid' : ''} inputMode="decimal" value={drafts[key] ?? ''} onChange={event => changeNumeric(key, event.target.value, 1)} onBlur={() => commitNumeric(key, 1)} placeholder="—"/></label><NotePopover label={`${gradeFields[key]} notes`} value={detail.inspection[gradeNotes[key]]} onChange={value => editor.editInspection(gradeNotes[key], value)}/></div>)}</div>
      <p className="microcopy">Estimated Grade is your judgment and is never calculated from the subgrades.</p>
    </section>
    <section className="workbench-section centering"><div className="section-title"><div><div className="eyebrow">RAW MEASUREMENTS</div><h3>Centering</h3></div></div>
      <div className="pair-grid">{measurementPairs.map(pair => <div className="measurement-pair" key={pair.label}><div className="pair-heading"><strong>{pair.label}</strong><small>{pair.direction}</small></div><div className="measurement-inputs">{([pair.first, pair.second] as MeasurementField[]).map((key, index) => <label key={key}>{index ? pair.secondLabel : pair.firstLabel}<span className="unit-input"><input aria-label={`${pair.label} ${index ? pair.secondLabel : pair.firstLabel}`} className={invalid[key] ? 'invalid' : ''} inputMode="decimal" value={drafts[key] ?? ''} onChange={event => changeNumeric(key, event.target.value, 2)} onBlur={() => commitNumeric(key, 2)} placeholder="—"/><span>mm</span></span></label>)}</div><div className="ratio"><span>Calculated ratio</span><strong>{invalid[pair.first] || invalid[pair.second] ? '—' : centeringRatio(detail.inspection[pair.first], detail.inspection[pair.second]) ?? '—'}</strong></div></div>)}</div>
      <div className="skew-result"><div><span>Apparent skew</span><small>Approximate, using typical card dimensions</small></div><strong>{skew.state === 'none' ? 'No apparent skew' : skew.state === 'estimated' ? `~${skew.degrees!.toFixed(1)}° ${skew.direction}` : 'Unavailable'}</strong></div>
    </section>
    <section className="workbench-section defects"><div className="section-title"><div><div className="eyebrow">OPTIONAL EVIDENCE</div><h3>Defect map <span className="count">{detail.markers.length}</span></h3></div><span>Click a card to add</span></div>
      <div className="defect-layout"><div className="card-maps">{(['front', 'back'] as const).map(side => <DefectMap key={side} side={side} markers={detail.markers} selected={selectedMarker} select={setSelectedMarker} add={addMarker}/>)}</div>
        <div className="marker-panel">{selectedMarker ? <MarkerEditor marker={detail.markers.find(marker => marker.id === selectedMarker)} index={detail.markers.findIndex(marker => marker.id === selectedMarker) + 1} editor={editor} remove={() => { removeMarker(selectedMarker); setSelectedMarker(null) }}/> : <div className="marker-empty"><strong>No marker selected</strong><p>Select a numbered marker to add a note or remove it.</p></div>}</div></div>
    </section>
    {inputError && <div role="alert" className="error">{inputError}<button aria-label="Dismiss input error" onClick={() => setInputError('')}>×</button></div>}
    <section className="finalize-panel"><div><div className="eyebrow">WORKFLOW</div><h3>{detail.card.finalizationState === 'in_progress' ? 'Ready when you are' : detail.card.finalizationState === 'changes_pending' ? 'Review changes and finalize again' : 'Assessment finalized'}</h3><p>{detail.card.finalizedAt ? `Last finalized ${new Date(detail.card.finalizedAt).toLocaleString()}.` : 'Finalization checks only the thirteen required grading and centering values.'}</p></div><button className="primary finalize" disabled={busy} onClick={() => { if (Object.values(invalid).some(Boolean)) setInputError('Correct the highlighted numeric fields before finalizing.'); else finalize() }}>{detail.card.status === 'finalized' ? 'Finalize again' : 'Finalize assessment'}</button></section>
  </div>
}

function NotePopover({ label, value, onChange }: { label: string; value: string | null; onChange: (value: string) => void }): React.JSX.Element {
  return <details className="note-popover"><summary className={value ? 'has-note' : ''} aria-label={label} title={label}>✎</summary><div className="popover"><label>{label}<textarea aria-label={`${label} text`} maxLength={20000} rows={4} value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder="Optional note…"/></label></div></details>
}

function DefectMap({ side, markers, selected, select, add }: { side: DefectMarker['side']; markers: DefectMarker[]; selected: string | null; select: (id: string) => void; add: (side: DefectMarker['side'], x: number, y: number) => void }): React.JSX.Element {
  const own = markers.filter(marker => marker.side === side)
  return <div className="map-wrap"><span>{side.toUpperCase()}</span><div className="card-map" role="group" aria-label={`${side} defect map`} onClick={event => { if ((event.target as HTMLElement).closest('.marker')) return; const rect = event.currentTarget.getBoundingClientRect(); add(side, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height) }}>{own.map(marker => <button key={marker.id} className={selected === marker.id ? 'marker selected-marker' : 'marker'} style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }} aria-label={`Marker ${markers.indexOf(marker) + 1}, ${side}`} onClick={() => select(marker.id)}>{markers.indexOf(marker) + 1}</button>)}</div></div>
}

function MarkerEditor({ marker, index, editor, remove }: { marker?: DefectMarker; index: number; editor: CardAutosave; remove: () => void }): React.JSX.Element {
  if (!marker) return <div className="marker-empty">Marker no longer exists.</div>
  return <div><div className="marker-title"><span className="marker-number">{index}</span><div><strong>Marker {index}</strong><small>{marker.side.toUpperCase()} · {(marker.x * 100).toFixed(1)}%, {(marker.y * 100).toFixed(1)}% · {marker.linkedPhotoCount} linked {marker.linkedPhotoCount === 1 ? 'photo' : 'photos'}</small></div></div><label>Marker note<textarea aria-label={`Marker ${index} note`} rows={5} maxLength={20000} value={marker.note ?? ''} onChange={event => editor.editMarkerNote(marker.id, event.target.value)} placeholder="Optional note…"/></label><button className="danger subtle" onClick={remove}>Remove marker</button></div>
}

const fullSlots: PrimaryPhotoSlot[] = ['full_front', 'full_back']
const cornerSlots: PrimaryPhotoSlot[] = ['corner_top_left', 'corner_top_right', 'corner_bottom_left', 'corner_bottom_right']
const edgeSlots: PrimaryPhotoSlot[] = ['edge_top', 'edge_right', 'edge_bottom', 'edge_left']

function PhotosView({ detail, editor, busy, choose, drop, setLocked, setMarkers, remove }: {
  detail: CardDetail; editor: CardAutosave; busy: boolean
  choose: (slot: PrimaryPhotoSlot | null) => void; drop: (slot: PrimaryPhotoSlot | null, files: File[]) => void
  setLocked: (id: string, locked: boolean) => void; setMarkers: (id: string, markerIds: string[]) => void; remove: (id: string) => void
}): React.JSX.Element {
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Photo | null>(null)
  const [replacing, setReplacing] = useState<{ photo: Photo; files?: File[] } | null>(null)
  const viewed = detail.photos.find(photo => photo.id === viewerId)
  useEffect(() => {
    if (!viewerId) return
    const close = (event: KeyboardEvent): void => { if (event.key === 'Escape') setViewerId(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [viewerId])
  const primary = (slot: PrimaryPhotoSlot): Photo | undefined => detail.photos.find(photo => photo.slot === slot)
  const additional = detail.photos.filter(photo => photo.slot === null)
  const replace = (photo: Photo, files?: File[]): void => { if (!photo.locked) setReplacing({ photo, files }) }
  const acceptDrop = (event: React.DragEvent, slot: PrimaryPhotoSlot | null, photo?: Photo): void => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files)
    if (!files.length) return
    if (photo) {
      if (photo.locked) drop(slot, files.slice(0, 1))
      else setReplacing({ photo, files: files.slice(0, 1) })
    } else drop(slot, slot === null ? files : files.slice(0, 1))
  }
  return <div className="photos-workbench">
    <div className="photos-intro"><div><div className="eyebrow">SUPPORTING EVIDENCE</div><h3>Photos</h3><p>Originals are copied into this library. Photos are optional and never affect finalization.</p></div><span>{detail.photos.length} {detail.photos.length === 1 ? 'photo' : 'photos'}</span></div>
    <PhotoGroup title="Full Card" hint="Front and back" className="full-photo-grid" slots={fullSlots} primary={primary} busy={busy} choose={choose} drop={acceptDrop} view={setViewerId} replace={replace} lock={setLocked} remove={setRemoving} markers={detail.markers} setMarkers={setMarkers}/>
    <PhotoGroup title="Corners" hint="Physical 2 × 2 arrangement" className="corner-photo-grid" slots={cornerSlots} primary={primary} busy={busy} choose={choose} drop={acceptDrop} view={setViewerId} replace={replace} lock={setLocked} remove={setRemoving} markers={detail.markers} setMarkers={setMarkers}/>
    <PhotoGroup title="Edges" hint="Top, right, bottom, left" className="edge-photo-grid" slots={edgeSlots} primary={primary} busy={busy} choose={choose} drop={acceptDrop} view={setViewerId} replace={replace} lock={setLocked} remove={setRemoving} markers={detail.markers} setMarkers={setMarkers}/>
    <section className="photo-group additional-group"><div className="photo-group-heading"><div><h3>Additional Photos</h3><p>Any other view. Titles are optional.</p></div><button disabled={busy} onClick={() => choose(null)}>＋ Add photos</button></div>
      <div className={additional.length ? 'additional-photo-grid' : 'additional-drop empty-additional'} onDragOver={event => event.preventDefault()} onDrop={event => acceptDrop(event, null)}>
        {additional.length ? additional.map(photo => <PhotoTile key={photo.id} photo={photo} label={photo.title || 'Untitled photo'} busy={busy} view={setViewerId} replace={replace} lock={setLocked} remove={setRemoving} markers={detail.markers} setMarkers={setMarkers} title={<input aria-label={`Title for ${photo.originalFilename}`} disabled={busy} maxLength={20000} value={photo.title ?? ''} onChange={event => editor.editPhotoTitle(photo.id, event.target.value)} placeholder="Optional title"/>}/>) : <div><strong>Drop photos here</strong><p>JPEG, PNG, or WebP · multiple files welcome</p><button disabled={busy} onClick={() => choose(null)}>Choose photos</button></div>}
      </div>
    </section>
    {viewed && <PhotoViewer photo={viewed} label={viewed.slot ? photoSlots[viewed.slot] : viewed.title || 'Untitled photo'} close={() => setViewerId(null)}/>}
    {removing && <div className="modal-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-photo-title"><div className="eyebrow">PERMANENT ACTION</div><h2 id="remove-photo-title">Remove this photo?</h2><p>The library copy and its thumbnail will be permanently removed. Linked defect markers will remain.</p><div className="actions"><button onClick={() => setRemoving(null)}>Keep photo</button><button className="danger solid" onClick={() => { remove(removing.id); setRemoving(null) }}>Remove permanently</button></div></div></div>}
    {replacing && <div className="modal-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-photo-title"><div className="eyebrow">REPLACE PRIMARY PHOTO</div><h2 id="replace-photo-title">Replace {photoSlots[replacing.photo.slot!]}?</h2><p>The current library copy and thumbnail will be removed only after the new image is safely copied and processed.</p><div className="actions"><button onClick={() => setReplacing(null)}>Keep current</button><button className="primary" onClick={() => { const pending = replacing; setReplacing(null); if (pending.files) drop(pending.photo.slot, pending.files); else choose(pending.photo.slot) }}>Choose replacement</button></div></div></div>}
  </div>
}

function PhotoGroup({ title, hint, className, slots, primary, busy, choose, drop, view, replace, lock, remove, markers, setMarkers }: {
  title: string; hint: string; className: string; slots: PrimaryPhotoSlot[]; primary: (slot: PrimaryPhotoSlot) => Photo | undefined; busy: boolean
  choose: (slot: PrimaryPhotoSlot) => void; drop: (event: React.DragEvent, slot: PrimaryPhotoSlot, photo?: Photo) => void
  view: (id: string) => void; replace: (photo: Photo, files?: File[]) => void; lock: (id: string, locked: boolean) => void
  remove: (photo: Photo) => void; markers: DefectMarker[]; setMarkers: (id: string, markerIds: string[]) => void
}): React.JSX.Element {
  return <section className="photo-group"><div className="photo-group-heading"><div><h3>{title}</h3><p>{hint}</p></div></div><div className={className}>{slots.map(slot => {
    const photo = primary(slot)
    return photo ? <PhotoTile key={slot} photo={photo} label={photoSlots[slot]} busy={busy} view={view} replace={replace} lock={lock} remove={remove} markers={markers} setMarkers={setMarkers} onDrop={event => drop(event, slot, photo)}/> : <button key={slot} className="empty-photo-slot" aria-label={`Add ${photoSlots[slot]} photo`} disabled={busy} onClick={() => choose(slot)} onDragOver={event => event.preventDefault()} onDrop={event => drop(event, slot)}><span className="slot-plus">＋</span><strong>{photoSlots[slot]}</strong><small>Choose or drop a photo</small></button>
  })}</div></section>
}

function PhotoTile({ photo, label, title, busy, view, replace, lock, remove, markers, setMarkers, onDrop }: {
  photo: Photo; label: string; title?: React.ReactNode; busy: boolean; view: (id: string) => void; replace: (photo: Photo, files?: File[]) => void
  lock: (id: string, locked: boolean) => void; remove: (photo: Photo) => void; markers: DefectMarker[]; setMarkers: (id: string, markerIds: string[]) => void
  onDrop?: (event: React.DragEvent) => void
}): React.JSX.Element {
  return <article className={photo.locked ? 'photo-tile locked-photo' : 'photo-tile'} onDragOver={event => { if (onDrop) event.preventDefault() }} onDrop={onDrop}>
    <button className="photo-image" onClick={() => view(photo.id)} aria-label={`View ${label}`}><img loading="lazy" src={photoMediaUrl(photo.id, 'thumbnail')} alt={label}/><span>{photo.locked ? '▣ Locked' : 'View'}</span></button>
    <div className="photo-tile-body"><div className="photo-label"><strong>{label}</strong><small title={photo.originalFilename}>{photo.originalFilename}</small></div>{title}
      <div className="photo-actions"><button aria-label={`${photo.locked ? 'Unlock' : 'Lock'} ${label}`} disabled={busy} onClick={() => lock(photo.id, !photo.locked)}>{photo.locked ? 'Unlock' : 'Lock'}</button>{photo.slot && !photo.locked && <button aria-label={`Replace ${label}`} disabled={busy} onClick={() => replace(photo)}>Replace</button>}{!photo.locked && <button aria-label={`Remove ${label}`} className="danger subtle" disabled={busy} onClick={() => remove(photo)}>Remove</button>}</div>
      <PhotoMarkerLinks photo={photo} markers={markers} busy={busy} setMarkers={setMarkers}/>
    </div>
  </article>
}

function PhotoMarkerLinks({ photo, markers, busy, setMarkers }: { photo: Photo; markers: DefectMarker[]; busy: boolean; setMarkers: (id: string, markerIds: string[]) => void }): React.JSX.Element {
  return <details className="photo-marker-links"><summary>{photo.markerIds.length ? `${photo.markerIds.length} linked ${photo.markerIds.length === 1 ? 'marker' : 'markers'}` : 'Link defect markers'}</summary><div>{markers.length ? markers.map((marker, index) => <label key={marker.id}><input type="checkbox" disabled={busy} checked={photo.markerIds.includes(marker.id)} onChange={event => setMarkers(photo.id, event.target.checked ? [...photo.markerIds, marker.id] : photo.markerIds.filter(id => id !== marker.id))}/><span><strong>Marker {index + 1} — {marker.side.toUpperCase()}</strong>{marker.note && <small>{marker.note.slice(0, 80)}</small>}</span></label>) : <p>No defect markers on this card.</p>}</div></details>
}

function PhotoViewer({ photo, label, close }: { photo: Photo; label: string; close: () => void }): React.JSX.Element {
  return <div className="photo-viewer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close() }}><div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`Viewing ${label}`}><div className="viewer-heading"><div><strong>{label}</strong><small>{photo.originalFilename}</small></div><button aria-label="Close photo viewer" onClick={close}>×</button></div><div className="viewer-canvas"><img src={photoMediaUrl(photo.id, 'original')} alt={label}/></div></div></div>
}

function Settings({ info, busy, onSubmit, onChoose }: { info: LibraryInfo; busy: boolean; onSubmit: (setup: Setup) => void; onChoose: (create: boolean) => void }): React.JSX.Element {
  const [name, setName] = useState(info.installationName || 'My workstation')
  const [start, setStart] = useState(serialText(info.allocation?.start ?? 1))
  const [end, setEnd] = useState(serialText(info.allocation?.end ?? 50000))
  const [next, setNext] = useState(serialText(info.allocation?.next ?? 1))
  return <div className="settings"><div className="eyebrow">MAKE YOURSELF AT HOME</div><h1>{info.allocation ? 'Library settings' : 'Set up your workstation'}</h1><p>Give this installation a name and its own range of permanent serials.</p><form onSubmit={event => { event.preventDefault(); onSubmit({ name, start: Number(start), end: Number(end), next: Number(next) }) }}><fieldset disabled={busy}><label>Workstation name<input required maxLength={200} value={name} onChange={event => setName(event.target.value)}/></label><div className="settings-range"><label>First serial<input required inputMode="numeric" pattern="[0-9]{1,10}" value={start} onChange={event => setStart(event.target.value)}/></label><label>Last serial<input required inputMode="numeric" pattern="[0-9]{1,10}" value={end} onChange={event => setEnd(event.target.value)}/></label><label>Next serial<input required inputMode="numeric" pattern="[0-9]{1,10}" value={next} onChange={event => setNext(event.target.value)}/></label></div><div className="notice">The usual range is 50,000 serials per installation. Previously assigned serials stay reserved forever, including after card deletion.</div><button className="primary" type="submit">Save allocation</button></fieldset></form>{info.history.length > 0 && <section className="range-history"><h2>Allocation history</h2>{info.history.map(allocation => <div key={allocation.id}><span className="serial">{serialText(allocation.start)} – {serialText(allocation.end)}</span><span>{allocation.retiredAt ? 'Retired' : allocation.next > allocation.end ? 'Exhausted' : 'Current'}</span></div>)}</section>}<section className="library-location"><h2>Library folder</h2><p>{info.folder}</p><div className="actions"><button disabled={busy} onClick={() => onChoose(false)}>Open another library</button><button disabled={busy} onClick={() => onChoose(true)}>Create another library</button></div></section></div>
}

createRoot(document.getElementById('root')!).render(<App/>)
