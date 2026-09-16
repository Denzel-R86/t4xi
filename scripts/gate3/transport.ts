import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const container='t4xi-whatsapp-gate3-status';
export const lit=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
export const val=(v:unknown):string=>v==null?'null':typeof v==='object'?lit(JSON.stringify(v))+'::jsonb':lit(String(v));
export async function query(database:string, sql:string) {
  assert.match(database,/^gate3_[0-9]+$/);
  const result=await exec('docker',['exec',container,'psql','-U','postgres','-d',database,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],{maxBuffer:8*1024*1024});
  return result.stdout.trim();
}
/** Test-only transport: real SDK requests -> canonical SQL on network-none PG.
 * No fallback to fetch/network is possible. Not a PostgREST integration claim. */
export function installTransport(database:string,label:string,afterBooking?:()=>Promise<void>,failStatus=false) {
  process.env.APP_ENV='development';process.env.NEXT_PUBLIC_APP_ENV='development';
  process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:65530';process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-only';
  process.env.COMMUNICATION_RECIPIENT_ALLOWLIST='';process.env.OPS_EMAIL='ops@example.invalid';delete process.env.RESEND_API_KEY;
  globalThis.fetch=async (input,init) => {
    const request=new Request(input,init); const url=new URL(request.url);
    await query(database,`insert into test.transport_log(label,url,method) values(${lit(label)},${lit(url.origin+url.pathname)},${lit(request.method)});`);
    assert.equal(url.origin,'http://127.0.0.1:65530','external transport forbidden');
    const path=url.pathname.replace('/rest/v1/','');
    const body=request.method==='GET'?null:JSON.parse(await request.text());
    try {
      if(path.startsWith('rpc/')) {
        const name=path.slice(4);
        assert.ok(['create_price_snapshot','create_booking_from_snapshot','create_booking','register_flight_monitoring'].includes(name),'unexpected RPC '+name);
        await query(database,`insert into test.domain_calls(label,name,args) values(${lit(label)},${lit(name)},${val(body)});`);
        const args=Object.entries(body as Record<string,unknown>).map(([k,v])=>{assert.match(k,/^p_[a-z_]+$/);return k+'=>'+val(v);}).join(',');
        const result=await query(database,`set role service_role; select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.${name}(${args}) r;`);
        if(name==='create_booking_from_snapshot') await afterBooking?.();
        const parsed=JSON.parse(result);
        return Response.json(name==='create_price_snapshot'?(typeof parsed[0]==='string'?parsed[0]:Object.values(parsed[0])[0]):parsed);
      }
      assert.ok(['bookings','price_snapshots'].includes(path),'unexpected table '+path);
      const key=path==='bookings'?'id':'quote_id';const filter=url.searchParams.get(key);assert.ok(filter?.startsWith('eq.'));
      const id=filter!.slice(3);
      if(request.method==='GET') {
        if(failStatus&&path==='bookings') return Response.json({message:'injected read unavailable'},{status:503});
        const result=await query(database,`set role service_role; select to_jsonb(r) from public.${path} r where ${key}=${lit(id)};`);
        return Response.json(result?JSON.parse(result):null);
      }
      assert.equal(request.method,'PATCH');assert.equal(path,'bookings');
      const fields=Object.entries(body).map(([k,v])=>{assert.ok(['email_sent','return_date','return_time','return_flight_number','notes'].includes(k));return k+'='+val(v);});
      await query(database,`set role service_role; update public.bookings set ${fields.join(',')} where id=${lit(id)};`);
      return new Response(null,{status:204});
    } catch(error) {
      if(error instanceof assert.AssertionError) throw error;
      return Response.json({message:String(error)},{status:500});
    }
  };
}
