import { useEffect, useState } from 'react';
import { adminRequest } from '../../lib/api';
import { useFeedback } from '../FeedbackProvider';

export type OrderSupportCase = {
  id:number; reference:string; case_type:'cancellation'|'return'; status:string; reason_category:string; reason_details:string;
  evidence_urls:string[]|string|null; supplier_return_reference:string|null; supplier_return_url:string|null;
  return_courier_name:string|null; return_tracking_number:string|null; return_tracking_url:string|null;
  resolution:string; refund_amount:number|null; internal_notes:string|null; resolved_at:string|null; created_at:string; updated_at:string;
};

const reasons = [
  ['changed_mind','Changed mind'],['incorrect_item','Incorrect item'],['damaged','Damaged'],['defective','Defective'],
  ['late_delivery','Late delivery'],['duplicate_order','Duplicate order'],['address_problem','Address problem'],
  ['supplier_unavailable','Supplier unavailable'],['other','Other'],
] as const;
const statuses = ['open','reviewing','approved','declined','collection_scheduled','in_transit','received','resolved','closed'];
const resolutions = ['pending','refund','replacement','repair','cancelled_without_charge','declined','other'];
const safeEvidence = (value:OrderSupportCase['evidence_urls']) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { const parsed=JSON.parse(value); return Array.isArray(parsed)?parsed:[]; } catch { return []; }
};

function CaseEditor({ orderId, supportCase, onSaved }:{ orderId:number; supportCase:OrderSupportCase; onSaved:()=>Promise<void> }) {
  const { notify } = useFeedback();
  const [busy,setBusy] = useState(false);
  const [form,setForm] = useState({
    status:supportCase.status, resolution:supportCase.resolution || 'pending',
    supplierReturnReference:supportCase.supplier_return_reference || '', supplierReturnUrl:supportCase.supplier_return_url || '',
    returnCourierName:supportCase.return_courier_name || '', returnTrackingNumber:supportCase.return_tracking_number || '',
    returnTrackingUrl:supportCase.return_tracking_url || '', refundAmount:supportCase.refund_amount == null ? '' : String(supportCase.refund_amount),
    internalNotes:supportCase.internal_notes || '',
  });
  const field=(key:keyof typeof form,value:string)=>setForm((current)=>({...current,[key]:value}));
  const save=async()=>{
    setBusy(true);
    try {
      await adminRequest(`/orders/${orderId}/cases/${supportCase.id}`,{method:'PATCH',body:JSON.stringify({
        ...form, refundAmount:form.refundAmount === '' ? null : Number(form.refundAmount),
        supplierReturnReference:form.supplierReturnReference || null, supplierReturnUrl:form.supplierReturnUrl || null,
        returnCourierName:form.returnCourierName || null, returnTrackingNumber:form.returnTrackingNumber || null,
        returnTrackingUrl:form.returnTrackingUrl || null, internalNotes:form.internalNotes || null,
      })});
      await onSaved(); notify(`${supportCase.reference} was updated.`,'success','Case saved');
    } catch(error){notify(error instanceof Error?error.message:'The case could not be updated.','error');}
    finally{setBusy(false);}
  };
  const evidence=safeEvidence(supportCase.evidence_urls);
  return <article className="support-case-card">
    <div className="support-case-heading"><div><strong>{supportCase.reference}</strong><span>{supportCase.case_type.replaceAll('_',' ')} · {supportCase.reason_category.replaceAll('_',' ')}</span></div><b>{supportCase.status.replaceAll('_',' ')}</b></div>
    <p>{supportCase.reason_details}</p>
    {evidence.length>0&&<p className="support-evidence">{evidence.map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer">Evidence {index+1}</a>)}</p>}
    <div className="support-case-grid">
      <label>Case status<select value={form.status} onChange={(event)=>field('status',event.target.value)}>{statuses.map((status)=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label>
      <label>Resolution<select value={form.resolution} onChange={(event)=>field('resolution',event.target.value)}>{resolutions.map((resolution)=><option key={resolution} value={resolution}>{resolution.replaceAll('_',' ')}</option>)}</select></label>
      <label>Supplier return reference<input value={form.supplierReturnReference} onChange={(event)=>field('supplierReturnReference',event.target.value)}/></label>
      <label>Supplier return link<input type="url" value={form.supplierReturnUrl} onChange={(event)=>field('supplierReturnUrl',event.target.value)}/></label>
      <label>Return courier<input value={form.returnCourierName} onChange={(event)=>field('returnCourierName',event.target.value)}/></label>
      <label>Return tracking number<input value={form.returnTrackingNumber} onChange={(event)=>field('returnTrackingNumber',event.target.value)}/></label>
      <label>Return tracking link<input type="url" value={form.returnTrackingUrl} onChange={(event)=>field('returnTrackingUrl',event.target.value)}/></label>
      <label>Refund amount<div className="money-input">R <input type="number" min="0" step="0.01" value={form.refundAmount} onChange={(event)=>field('refundAmount',event.target.value)}/></div></label>
      <label className="full-field">Internal notes<textarea rows={3} value={form.internalNotes} onChange={(event)=>field('internalNotes',event.target.value)}/></label>
    </div>
    <button type="button" className="outline-button" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save case progress'}</button>
  </article>;
}

export default function ReturnCaseManager({ orderId, orderStatus, cases, onSaved }:{ orderId:number; orderStatus:string; cases:OrderSupportCase[]; onSaved:()=>Promise<void> }) {
  const { notify } = useFeedback();
  const [busy,setBusy]=useState(false);
  const canCancel=!['delivered','cancelled','refunded'].includes(orderStatus);
  const canReturn=['shipped','delivered'].includes(orderStatus);
  const [caseType,setCaseType]=useState<'cancellation'|'return'>(canCancel?'cancellation':'return');
  const [reasonCategory,setReasonCategory]=useState('changed_mind');
  const [reasonDetails,setReasonDetails]=useState('');
  const [evidence,setEvidence]=useState('');
  useEffect(() => {
    if (caseType === 'cancellation' && !canCancel && canReturn) setCaseType('return');
    if (caseType === 'return' && !canReturn && canCancel) setCaseType('cancellation');
  }, [canCancel, canReturn, caseType]);
  const create=async()=>{
    if(reasonDetails.trim().length<3)return notify('Add a short reason for the request.','warning');
    setBusy(true);
    try{
      const evidenceUrls=evidence.split(/[\n,]/).map((value)=>value.trim()).filter(Boolean);
      await adminRequest(`/orders/${orderId}/cases`,{method:'POST',body:JSON.stringify({caseType,reasonCategory,reasonDetails:reasonDetails.trim(),evidenceUrls})});
      setReasonDetails('');setEvidence('');await onSaved();notify('The support case was opened and added to the order audit trail.','success','Case opened');
    }catch(error){notify(error instanceof Error?error.message:'The case could not be opened.','error');}
    finally{setBusy(false);}
  };
  return <section className="support-cases">
    <h3>Cancellation and return cases</h3>
    {cases.length?cases.map((item)=><CaseEditor key={item.id} orderId={orderId} supportCase={item} onSaved={onSaved}/>):<p>No cancellation or return case has been opened.</p>}
    {(canCancel||canReturn)&&<div className="support-case-create">
      <h4>Open a case</h4>
      <label>Case type<select value={caseType} onChange={(event)=>setCaseType(event.target.value as typeof caseType)}>{canCancel&&<option value="cancellation">Cancellation</option>}{canReturn&&<option value="return">Return</option>}</select></label>
      <label>Reason<select value={reasonCategory} onChange={(event)=>setReasonCategory(event.target.value)}>{reasons.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="full-field">Reason details<textarea rows={3} value={reasonDetails} onChange={(event)=>setReasonDetails(event.target.value)}/></label>
      <label className="full-field">Evidence links <span>(optional, one per line)</span><textarea rows={2} value={evidence} onChange={(event)=>setEvidence(event.target.value)} placeholder="https://…"/></label>
      <button type="button" className="outline-button" disabled={busy||(caseType==='cancellation'?!canCancel:!canReturn)} onClick={()=>void create()}>{busy?'Opening…':'Open case'}</button>
    </div>}
  </section>;
}
