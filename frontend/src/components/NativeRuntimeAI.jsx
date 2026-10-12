import React, {useEffect,useState} from 'react';
import {api} from '../api';
import NativeAIControls from './NativeAIControls';
import NativeAIReport from './NativeAIReport';
import useNativeAIRequest from './useNativeAIRequest';
import './NativeRuntimeAI.css';

function recommendationRows(response) {
  const rows = response?.recommendations ?? response?.data;
  if (!Array.isArray(rows)) throw new Error('The recommendations response did not contain a record list.');
  return rows;
}

export default function NativeRuntimeAI({config,request}) {
  const [fields,setFields]=useState({}),[result,setResult]=useState(null),[error,setError]=useState('');
  const [history,setHistory]=useState([]),[selected,setSelected]=useState(null),[historyError,setHistoryError]=useState('');
  const native=useNativeAIRequest();
  useEffect(()=>{let active=true;api('/runtime-ai/recommendations').then(data=>{if(active)setHistory(recommendationRows(data));}).catch(failure=>{if(active)setHistoryError(failure.message);});return()=>{active=false;};},[]);
  const presets=[0,1,2].map(index=>({name:['Quick brief','Team planning','Detailed review'][index],fill:()=>{setFields(Object.fromEntries(config.fields.map(field=>[field.key,field.examples[index]])));return {filled:config.fields.length,manual:[]};}}));
  async function generate(event){event.preventDefault();setError('');setResult(null);try{const body=Object.fromEntries(config.fields.map(field=>[field.key,fields[field.key]||'']));const response=await native.run(signal=>request(config.endpoint,body,{signal}));setResult(response);try{const data=await api('/runtime-ai/recommendations');setHistory(recommendationRows(data));setHistoryError('');}catch(failure){setHistoryError(failure.message);}}catch(failure){setError(failure.name==='AbortError'?'Request canceled.':failure.response?.data?.error||failure.message);}}
  async function openHistory(id){setHistoryError('');try{setSelected(await api(`/runtime-ai/recommendations/${id}`));}catch(failure){setHistoryError(failure.message);}}
  return <section className="native-runtime-ai" id="ai-readiness"><header><p className="ai-eyebrow">Native AI workspace</p><h1>{config.title}</h1><p>{config.description}</p></header><NativeAIControls busy={native.busy} onCancel={native.cancel} presets={presets} context={config.title}><form onSubmit={generate}><div className="native-runtime-fields">{config.fields.map(field=><label key={field.key} htmlFor={'native-runtime-'+field.key}>{field.label}{field.required?' *':' (optional)'}<textarea id={'native-runtime-'+field.key} data-ai-field={field.key} rows={5} required={field.required} maxLength={field.maxLength||4000} value={fields[field.key]||''} onChange={event=>setFields({...fields,[field.key]:event.target.value})}/></label>)}</div><button type="submit" className="native-runtime-generate" disabled={native.busy}>{native.busy?'Generating…':'Generate with OpenRouter'}</button>{error&&<p role="alert">{error}</p>}</form></NativeAIControls>{result&&<NativeAIReport response={result} title={config.title}/>}<section className="native-runtime-history"><h2>Saved recommendations</h2>{historyError&&<p role="alert">{historyError}</p>}{!history.length&&!historyError&&<p>No saved recommendations yet.</p>}{history.map(item=><button type="button" key={item.id} onClick={()=>openHistory(item.id)}><span>{new Date(item.created_at).toLocaleString()} · {item.model}</span><span>{item.prompt}</span></button>)}{selected&&<div className="native-runtime-detail"><button type="button" onClick={()=>setSelected(null)}>Close saved report</button><NativeAIReport response={selected} title="Saved recommendation"/></div>}</section></section>;
}
