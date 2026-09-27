import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, FileUp, Info, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import { Footer, Header } from '../../components/swap-ui';
import './index.css';

type Mode = 'amount' | 'percentage';
type Recipient = { id: number; address: string; value: string; receiveAsset: string; routeNote: string };
type DraftStep = 'compose' | 'routes' | 'review';
type ComposerTab = 'manual' | 'csv';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAX_ROWS = 500;
const MAX_FILE_BYTES = 1024 * 1024;

function isSolanaAddress(input: string) {
  const value = input.trim();
  if (value.length < 32 || value.length > 44 || [...value].some(character => !BASE58.includes(character))) return false;
  let decoded = 0n;
  for (const character of value) decoded = decoded * 58n + BigInt(BASE58.indexOf(character));
  let bytes = 0;
  while (decoded > 0n) { bytes++; decoded >>= 8n; }
  return bytes + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}

function valueError(value: string, mode: Mode) {
  const trimmed = value.trim();
  if (!trimmed) return `Enter a ${mode}.`;
  if (!/^\d+(?:\.\d{1,9})?$/.test(trimmed)) return 'Use a positive number with up to 9 decimal places.';
  const number = Number(trimmed);
  if (!Number.isFinite(number) || number <= 0) return 'Enter a number greater than zero.';
  if (mode === 'percentage' && number > 100) return 'A share cannot exceed 100%.';
  return '';
}

function recipientErrors(rows: Recipient[], mode: Mode) {
  const counts = new Map<string, number>();
  rows.forEach(row => {
    const address = row.address.trim();
    if (address) counts.set(address, (counts.get(address) ?? 0) + 1);
  });
  return rows.map(row => {
    const address = row.address.trim();
    return {
      address: !address ? 'Enter a Solana recipient address.' : !isSolanaAddress(address) ? 'Enter a valid 32-byte Solana address.' : (counts.get(address) ?? 0) > 1 ? 'This address appears more than once.' : '',
      value: valueError(row.value, mode),
    };
  });
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else cell += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell.trim()); cell = ''; closedQuote = false;
      if (char !== ',') {
        if (!(row.length === 1 && row[0] === '')) rows.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (char === '"' && cell === '' && !closedQuote) quoted = true;
    else if (closedQuote && char !== ' ' && char !== '\t') throw new Error('Unexpected characters after a quoted CSV field.');
    else if (char === '"') throw new Error('Check CSV quoting: quotes must wrap an entire field.');
    else cell += char;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  row.push(cell.trim());
  if (!(row.length === 1 && row[0] === '')) rows.push(row);
  return rows;
}

function formatValue(value: number, mode: Mode) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 9 }).format(value)}${mode === 'percentage' ? '%' : ''}`;
}

export default function SplitMixerPreview() {
  const [rows, setRows] = useState<Recipient[]>([]);
  const [mode, setMode] = useState<Mode>('amount');
  const [asset, setAsset] = useState('');
  const [step, setStep] = useState<DraftStep>('compose');
  const [tab, setTab] = useState<ComposerTab>('manual');
  const [attempted, setAttempted] = useState(false);
  const [importError, setImportError] = useState<string[]>([]);
  const [importNotice, setImportNotice] = useState('');
  const nextId = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Split Mixer Preview | DarkSwap';
    return () => { document.title = previous; };
  }, []);

  const errors = recipientErrors(rows, mode);
  const total = rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  const hasRowErrors = errors.some(error => error.address || error.value);
  const percentageMismatch = mode === 'percentage' && rows.length > 0 && !hasRowErrors && Math.abs(total - 100) > 0.00000001;
  const canReview = rows.length > 0 && !hasRowErrors && !percentageMismatch;

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    setRows(current => [...current, { id: nextId.current++, address: '', value: '', receiveAsset: '', routeNote: '' }]);
    setTab('manual');
    setImportNotice('');
  }
  function updateRow(id: number, field: 'address' | 'value' | 'receiveAsset' | 'routeNote', value: string) {
    setRows(current => current.map(row => row.id === id ? { ...row, [field]: value } : row));
    setImportNotice('');
  }
  function changeMode(nextMode: Mode) {
    if (nextMode === mode) return;
    if (rows.some(row => row.value.trim()) && !window.confirm('Switching units clears all entered values. Keep recipient addresses and switch?')) return;
    setRows(current => current.map(row => ({ ...row, value: '' })));
    setMode(nextMode);
    setAttempted(false);
    setImportNotice('');
  }
  function reset() {
    if ((rows.length || asset || importNotice) && !window.confirm('Clear this local draft and start again?')) return;
    setRows([]);
    setMode('amount');
    setAsset('');
    setStep('compose');
    setTab('manual');
    setAttempted(false);
    setImportError([]);
    setImportNotice('');
    if (fileRef.current) fileRef.current.value = '';
  }
  function planRoutes() {
    setAttempted(true);
    if (!canReview) return;
    setStep('routes');
  }
  const routeErrors = rows.map(row => !row.receiveAsset.trim() ? 'Enter an intended receive asset.' : row.receiveAsset.trim().length > 40 ? 'Use 40 characters or fewer.' : '');
  const canFinishRoutes = rows.length > 0 && routeErrors.every(error => !error) && rows.every(row => row.routeNote.length <= 120);
  function review() {
    setAttempted(true);
    if (!canFinishRoutes) return;
    setStep('review');
  }
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError([]);
    setImportNotice('');
    if (file.size > MAX_FILE_BYTES) {
      setImportError(['File is too large. Choose a CSV smaller than 1 MB.']);
      event.target.value = '';
      return;
    }
    try {
      const parsed = parseCSV((await file.text()).replace(/^\uFEFF/, ''));
      if (!parsed.length) throw new Error('The CSV is empty. Add a header and at least one recipient.');
      const headers = parsed[0].map(header => header.trim().toLowerCase());
      const addressIndex = headers.indexOf('address');
      const amountIndex = headers.indexOf('amount');
      const percentageIndex = headers.indexOf('percentage');
      const receiveAssetIndex = headers.indexOf('receive_asset');
      const exchangeIndex = headers.indexOf('exchange');
      if (addressIndex < 0 || (amountIndex < 0 && percentageIndex < 0) || (amountIndex >= 0 && percentageIndex >= 0)) {
        throw new Error('Use headers address,amount OR address,percentage (not both).');
      }
      if (new Set(headers).size !== headers.length) throw new Error('CSV headers must not be repeated.');
      const importedMode: Mode = percentageIndex >= 0 ? 'percentage' : 'amount';
      const valueIndex = importedMode === 'percentage' ? percentageIndex : amountIndex;
      const records = parsed.slice(1);
      if (!records.length) throw new Error('Add at least one recipient beneath the header.');
      if (records.length > MAX_ROWS) throw new Error(`Import up to ${MAX_ROWS} recipients at a time.`);
      const invalid: string[] = [];
      const candidates: Recipient[] = records.map((record, index) => {
        if (record.length !== headers.length) invalid.push(`CSV row ${index + 2}: expected ${headers.length} columns, found ${record.length}.`);
        return { id: index, address: record[addressIndex] ?? '', value: record[valueIndex] ?? '', receiveAsset: receiveAssetIndex >= 0 ? record[receiveAssetIndex] ?? '' : '', routeNote: exchangeIndex >= 0 ? record[exchangeIndex] ?? '' : '' };
      });
      recipientErrors(candidates, importedMode).forEach((error, index) => {
        if (error.address) invalid.push(`CSV row ${index + 2}, address: ${error.address}`);
        if (error.value) invalid.push(`CSV row ${index + 2}, ${importedMode}: ${error.value}`);
      });
      candidates.forEach((row, index) => {
        if (row.receiveAsset.length > 40) invalid.push(`CSV row ${index + 2}, receive_asset: use 40 characters or fewer.`);
        if (row.routeNote.length > 120) invalid.push(`CSV row ${index + 2}, exchange: use 120 characters or fewer.`);
      });
      if (importedMode === 'percentage' && !invalid.length) {
        const sum = candidates.reduce((value, row) => value + Number(row.value), 0);
        if (Math.abs(sum - 100) > 0.00000001) invalid.push(`Percentage shares must total 100%; this file totals ${formatValue(sum, 'percentage')}.`);
      }
      if (invalid.length) {
        setImportError(invalid);
        return;
      }
      if (rows.length && !window.confirm('Replace the current local recipient list with this CSV?')) return;
      setRows(candidates.map(row => ({ ...row, id: nextId.current++ })));
      setMode(importedMode);
      setAttempted(false);
      setImportNotice(`Imported ${candidates.length} ${candidates.length === 1 ? 'recipient' : 'recipients'} from ${file.name}. Confirm each intended receive asset before review.`);
      setStep('routes');
    } catch (error) {
      setImportError([error instanceof Error ? error.message : 'Unable to read this file. Try another CSV.']);
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className="app-shell sw-page">
      <Header />
      <main id="main-content" className="sw-wrap">
        <section className="sw-hero" aria-labelledby="sw-title">
          <div>
            <div className="sw-kicker">DarkSwap / Solana / Feature preview</div>
            <h1 id="sw-title">Split Mixer <span>for Solana.</span></h1>
            <p>Explore a split-mixer concept: map one planned allocation into multiple recipient legs, then review the whole draft. This preview does not mix funds or obscure on-chain links.</p>
          </div>
          <div className="sw-hero-note"><strong>Concept workspace only</strong>01 / Map an allocation<br />02 / Describe intended legs<br />03 / Inspect the whole draft</div>
        </section>

        <section className="sw-boundary" aria-label="Preview limitations">
          <Info size={18} aria-hidden="true" />
          <div><strong>No mixing or transfers take place.</strong><p>This preview runs only in your browser. It does not pool funds, randomize transactions, hide links between wallets, connect a wallet, calculate quotes, or check route availability. Closing or refreshing the page clears your draft.</p></div>
        </section>

        <div className="sw-progress" aria-label="Draft steps">
          <div className="sw-progress-item" data-active={step === 'compose'} aria-current={step === 'compose' ? 'step' : undefined}><span className="sw-step-number">01</span><span>Map an allocation</span></div>
          <div className="sw-progress-item" data-active={step === 'routes'} aria-current={step === 'routes' ? 'step' : undefined}><span className="sw-step-number">02</span><span>Plan intended legs</span></div>
          <div className="sw-progress-item" data-active={step === 'review'} aria-current={step === 'review' ? 'step' : undefined}><span className="sw-step-number">03</span><span>Review full draft</span></div>
        </div>

        <div className="sw-workspace">
          <section className="sw-panel" aria-labelledby="sw-workspace-title">
            <div className="sw-panel-head">
              <div><div className="sw-overline">{step === 'compose' ? '01 / Compose' : step === 'routes' ? '02 / Intended legs' : '03 / Review'}</div><h2 id="sw-workspace-title">{step === 'compose' ? 'Build a local draft' : step === 'routes' ? 'Describe each intended leg.' : 'Every destination, in view.'}</h2><p>{step === 'compose' ? 'Add recipients yourself or import a CSV. No addresses are prefilled.' : step === 'routes' ? 'Name what each recipient should receive. Route labels are your notes, not connected providers.' : 'Check every address, share, and intended leg. This review cannot submit a payment.'}</p></div>
              <span className="sw-count" data-testid="text-recipient-count">{String(rows.length).padStart(2, '0')} RECIPIENT{rows.length === 1 ? '' : 'S'}</span>
            </div>
            {step === 'compose' ? (
              <div className="sw-body">
                <div className="sw-tabs" role="group" aria-label="Choose a draft method">
                  <button type="button" className="sw-tab" aria-pressed={tab === 'manual'} onClick={() => setTab('manual')} data-testid="button-manual-entry">Manual entry</button>
                  <button type="button" className="sw-tab" aria-pressed={tab === 'csv'} onClick={() => setTab('csv')} data-testid="button-csv-import">Import CSV</button>
                </div>
                {tab === 'manual' ? (
                  <>
                    <div className="sw-controls">
                      <div className="sw-field"><label htmlFor="sw-asset">Asset label <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label><input id="sw-asset" value={asset} maxLength={32} onChange={event => setAsset(event.target.value)} placeholder="Name the asset you plan to split" data-testid="input-asset-label" /><p className="sw-field-help">For your reference only; this does not select or verify a token.</p></div>
                      <div><span className="sw-label">Split by</span><div className="sw-mode" role="group" aria-label="Split unit"><button type="button" aria-pressed={mode === 'amount'} onClick={() => changeMode('amount')} data-testid="button-mode-amount">Amounts</button><button type="button" aria-pressed={mode === 'percentage'} onClick={() => changeMode('percentage')} data-testid="button-mode-percentage">Percentages</button></div></div>
                    </div>
                    <div className="sw-list-head"><div><h3>Recipients</h3><p>{mode === 'percentage' ? 'Shares must add up to exactly 100%.' : 'Enter a positive amount for each address.'}</p></div>{rows.length > 0 && <button type="button" className="sw-link" onClick={addRow} disabled={rows.length >= MAX_ROWS} data-testid="button-add-recipient">+ Add recipient</button>}</div>
                    {rows.length ? <div className="sw-rows">{rows.map((row, index) => {
                      const error = errors[index];
                      const showAddressError = Boolean(error.address && (attempted || row.address.trim()));
                      const showValueError = Boolean(error.value && (attempted || row.value.trim()));
                      return <div className="sw-row" key={row.id} data-testid={`row-recipient-${row.id}`}>
                        <span className="sw-row-index">{String(index + 1).padStart(2, '0')}</span>
                        <div className="sw-field"><label htmlFor={`sw-address-${row.id}`}>Solana address</label><input id={`sw-address-${row.id}`} value={row.address} onChange={event => updateRow(row.id, 'address', event.target.value)} placeholder="Paste recipient address" autoComplete="off" spellCheck={false} aria-invalid={showAddressError} aria-describedby={showAddressError ? `sw-address-error-${row.id}` : undefined} data-testid={`input-recipient-address-${row.id}`} />{showAddressError && <p id={`sw-address-error-${row.id}`} className="sw-row-error">{error.address}</p>}</div>
                        <div className="sw-field"><label htmlFor={`sw-value-${row.id}`}>{mode === 'amount' ? 'Amount' : 'Share (%)'}</label><input id={`sw-value-${row.id}`} type="text" inputMode="decimal" value={row.value} onChange={event => updateRow(row.id, 'value', event.target.value)} placeholder={mode === 'amount' ? 'Amount' : 'Percent'} aria-invalid={showValueError} aria-describedby={showValueError ? `sw-value-error-${row.id}` : undefined} data-testid={`input-recipient-value-${row.id}`} />{showValueError && <p id={`sw-value-error-${row.id}`} className="sw-row-error">{error.value}</p>}</div>
                        <button type="button" className="sw-icon-button" onClick={() => { setRows(current => current.filter(item => item.id !== row.id)); setImportNotice(''); }} aria-label={`Remove recipient ${index + 1}`} title="Remove recipient" data-testid={`button-remove-recipient-${row.id}`}><Trash2 size={16} aria-hidden="true" /></button>
                      </div>;
                    })}</div> : <div className="sw-empty" role="status"><div className="sw-empty-symbol"><Users size={24} aria-hidden="true" /></div><strong>No recipients yet.</strong><p>Start with an address you control or trust. Every destination will appear together in the review.</p><button type="button" className="sw-button-secondary" onClick={addRow} data-testid="button-add-first-recipient"><Plus size={15} aria-hidden="true" /> Add first recipient</button></div>}
                    {attempted && percentageMismatch && <div className="sw-error-box" role="alert">Shares currently add to {formatValue(total, 'percentage')}. Adjust them to total exactly 100% before reviewing.</div>}
                    {attempted && rows.length === 0 && <div className="sw-error-box" role="alert">Add at least one recipient to review a split.</div>}
                    <div className="sw-actions"><button type="button" className="sw-link" onClick={reset} data-testid="button-reset-draft">Reset draft</button><div className="sw-actions-right"><button type="button" className="sw-button" onClick={planRoutes} data-testid="button-plan-routes">Plan intended legs <ArrowRight size={15} aria-hidden="true" /></button></div></div>
                  </>
                ) : (
                  <>
                    <p className="sw-import-intro">Bring in a recipient list from a spreadsheet. The file is read in this browser only; invalid files do not replace your current draft.</p>
                    <div className="sw-schema"><strong>Expected CSV columns</strong><code>address,amount,receive_asset,exchange</code><p>Required: <code>address,amount</code> or <code>address,percentage</code> for shares totaling 100%. Optional: <code>receive_asset</code> (intended asset) and <code>exchange</code> (your provider label or route note). If omitted, add the intended asset in step 2. One recipient per row; the first row is the header. Solana addresses must be unique and values positive (up to 9 decimal places). Quoted fields are supported. No provider is contacted.</p></div>
                    <div className="sw-field"><label htmlFor="sw-import-file">Choose a .csv file</label><div className="sw-upload"><FileUp size={19} aria-hidden="true" /><input ref={fileRef} id="sw-import-file" type="file" accept=".csv,text/csv" onChange={handleFile} data-testid="input-import-csv" /></div><p className="sw-upload-note">Up to {MAX_ROWS} recipients · 1 MB maximum · Nothing is uploaded.</p></div>
                    {importError.length > 0 && <div className="sw-error-box" role="alert" data-testid="status-import-errors"><strong>Could not import this CSV. Your current draft is unchanged.</strong><ul>{importError.slice(0, 12).map((error, index) => <li key={index}>{error}</li>)}</ul>{importError.length > 12 && <p>And {importError.length - 12} more issues. Fix the file and try again.</p>}</div>}
                    {rows.length > 0 && <div className="sw-import-result"><strong>Current draft: {rows.length} recipient{rows.length === 1 ? '' : 's'}</strong><p>Importing another valid CSV replaces this list after your confirmation. You can always return to manual entry to edit it.</p><button type="button" className="sw-button-secondary" onClick={() => setTab('manual')} data-testid="button-edit-current-draft">Edit current draft <ArrowRight size={14} aria-hidden="true" /></button></div>}
                    <div className="sw-actions"><button type="button" className="sw-link" onClick={reset} data-testid="button-reset-import-draft">Reset draft</button></div>
                  </>
                )}
              </div>
            ) : step === 'routes' ? (
              <div className="sw-body">
                {importNotice && <div className="sw-review-note" role="status" data-testid="status-import-success"><strong>{importNotice}</strong>Imported fields remain editable here and in the previous step.</div>}
                <div className="sw-review-note"><strong>These are descriptions, not routes.</strong>Enter the intended receive asset per recipient. Add an optional exchange/provider label or route note in your own words. Nothing here verifies a provider, calculates a conversion, or establishes an executable or private route.</div>
                <div className="sw-leg-list">{rows.map((row, index) => <div className="sw-leg" key={row.id} data-testid={`row-leg-${row.id}`}>
                  <div className="sw-leg-head"><span className="sw-row-index">{String(index + 1).padStart(2, '0')}</span><code>{row.address.trim()}</code><strong>{formatValue(Number(row.value), mode)}{mode === 'amount' && asset.trim() ? ` ${asset.trim()}` : ''}</strong></div>
                  <div className="sw-leg-fields">
                    <div className="sw-field"><label htmlFor={`sw-receive-${row.id}`}>Intended receive asset</label><input id={`sw-receive-${row.id}`} value={row.receiveAsset} maxLength={40} onChange={event => updateRow(row.id, 'receiveAsset', event.target.value)} placeholder="Enter an asset name or symbol" aria-invalid={attempted && Boolean(routeErrors[index])} aria-describedby={attempted && routeErrors[index] ? `sw-receive-error-${row.id}` : undefined} data-testid={`input-receive-asset-${row.id}`} />{attempted && routeErrors[index] && <p className="sw-row-error" id={`sw-receive-error-${row.id}`}>{routeErrors[index]}</p>}</div>
                    <div className="sw-field"><label htmlFor={`sw-exchange-${row.id}`}>Exchange / provider / route note <span className="sw-optional">(optional)</span></label><input id={`sw-exchange-${row.id}`} value={row.routeNote} maxLength={120} onChange={event => updateRow(row.id, 'routeNote', event.target.value)} placeholder="Your own label or planning note" data-testid={`input-route-note-${row.id}`} /></div>
                  </div>
                </div>)}</div>
                <div className="sw-actions"><button type="button" className="sw-button-secondary" onClick={() => { setStep('compose'); setTab('manual'); }} data-testid="button-back-to-recipients"><ArrowLeft size={15} aria-hidden="true" /> Edit recipients</button><div className="sw-actions-right"><button type="button" className="sw-link" onClick={reset} data-testid="button-reset-routes">Reset draft</button><button type="button" className="sw-button" onClick={review} data-testid="button-review-draft">Review full draft <ArrowRight size={15} aria-hidden="true" /></button></div></div>
              </div>
            ) : (
              <div className="sw-body">
                <div className="sw-review-note" role="status" data-testid="status-review"><strong>Local draft ready for inspection.</strong>Addresses have only been checked for format and duplicates. Receive assets and route notes are user-entered intentions, not verified conversions or connected providers. Ownership, asset compatibility, fees, quotes, and route availability have not been checked.</div>
                <div className="sw-overline" style={{ marginBottom: 12 }}>Destination ledger / {mode === 'amount' ? 'Planned amounts' : 'Allocation percentages'}</div>
                <div className="sw-review-list">{rows.map((row, index) => <div className="sw-review-item" key={row.id} data-testid={`row-review-recipient-${row.id}`}><span>{String(index + 1).padStart(2, '0')}</span><code data-testid={`text-review-address-${row.id}`}>{row.address.trim()}</code><strong data-testid={`text-review-value-${row.id}`}>{formatValue(Number(row.value), mode)}</strong><div className="sw-review-leg"><span>Intended receive: <b data-testid={`text-review-receive-${row.id}`}>{row.receiveAsset.trim()}</b></span>{row.routeNote.trim() && <span>Route note: <b data-testid={`text-review-note-${row.id}`}>{row.routeNote.trim()}</b></span>}</div></div>)}</div>
                <div className="sw-review-bottom"><span>{mode === 'percentage' ? 'Allocated' : 'Draft total'}{asset.trim() && mode === 'amount' ? ` · ${asset.trim()}` : ''}</span><strong data-testid="text-review-total">{formatValue(total, mode)}</strong></div>
                <div className="sw-actions"><button type="button" className="sw-button-secondary" onClick={() => setStep('routes')} data-testid="button-edit-routes"><ArrowLeft size={15} aria-hidden="true" /> Edit intended legs</button><div className="sw-actions-right"><button type="button" className="sw-link" onClick={() => { setStep('compose'); setTab('manual'); }} data-testid="button-edit-draft">Edit recipients</button><button type="button" className="sw-link" onClick={reset} data-testid="button-reset-review"><RotateCcw size={13} aria-hidden="true" /> Reset draft</button></div></div>
              </div>
            )}
          </section>

          <aside className="sw-aside" aria-labelledby="sw-summary-title">
            <div className="sw-aside-head"><div className="sw-overline">Draft at a glance</div><h2 id="sw-summary-title">Split summary</h2></div>
            <div className="sw-aside-body"><div className="sw-total"><span>{mode === 'amount' ? 'Planned total' : 'Allocated share'}</span><strong data-testid="text-draft-total">{rows.length ? formatValue(total, mode) : '—'}</strong><small>{mode === 'amount' ? (asset.trim() || 'No asset label added') : 'Of the full split · target 100%'}</small></div>
              <dl className="sw-facts"><div><dt>Recipients</dt><dd data-testid="text-summary-recipient-count">{rows.length}</dd></div><div><dt>Unit</dt><dd>{mode === 'amount' ? 'Amounts' : 'Percentages'}</dd></div><div><dt>Draft status</dt><dd data-testid="status-draft">{rows.length === 0 ? 'Not started' : !canReview ? 'Needs attention' : canFinishRoutes ? 'Ready to review' : 'Add intended assets'}</dd></div><div><dt>Fee / quote / route</dt><dd>Not calculated</dd></div></dl>
              <p className="sw-aside-note">A sum here is only arithmetic on the values you entered. It is not a balance check, a conversion estimate, or a promise that any route exists.</p>
            </div>
          </aside>
        </div>
        <section className="sw-footnote" aria-labelledby="sw-about-title"><div><div className="sw-overline">About this preview</div><h2 id="sw-about-title">Clarity before commitment.</h2><p>Split Mixer explores how a multi-recipient allocation might be planned. It is a read-and-edit drafting tool, not an operating mixing service or a live DarkSwap route. No provider requests or wallet interactions are made by this page.</p></div><aside>Your draft lives only in this open tab’s memory. Refreshing, closing, or leaving the page discards it. Splitting a payment does not guarantee privacy: on-chain activity can still be analyzed and linked.</aside></section>
      </main>
      <Footer />
    </div>
  );
}