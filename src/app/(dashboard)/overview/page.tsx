"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

type Dashboard = {
  metrics: { totalUsers:number; totalTransactions:number; failedTransactions:number; failureRate:string; openComplianceAlerts:number; pendingKyc:number; activeAjoGroups:number; pendingCommunityReviews:number; openDisputes:number; monthlyActiveUsers:number; contributionCollectionRate:number; walletFloat:number };
  volumesNgn:{totalProcessed:string;feeRevenue:string;ajoContributions:string;ajoPayouts:string};
  trends:{periodDays:number;series:Array<{date:string;paymentVolumeNgn:number;ajoContributionsNgn:number}>};
  attention:{payoutApprovals:{count:number;amount:string;oldestAt:string|null};kycReviews:{count:number;oldestAt:string|null};riskAlerts:{count:number};reconciliationBreaks:{count:number;amount:string};disputes:{count:number};communityVerifications:{count:number}};
  providers:Array<{id:string;name:string;code:string;isActive:boolean;isDefault:boolean;updatedAt:string}>;
  topCommunities:Array<{id:string;name:string;volumeNgn:string}>;
  signupChannels:Record<string,number>;
};
type Profile={firstName:string;lastName:string;role:string};

export default function OverviewPage(){
  const [days,setDays]=useState(30);const [data,setData]=useState<Dashboard|null>(null);const [profile,setProfile]=useState<Profile|null>(null);const [error,setError]=useState("");
  useEffect(()=>{adminApi.overview(days).then(r=>setData(r.data as Dashboard)).catch((e:Error)=>setError(e.message));},[days]);
  useEffect(()=>{adminApi.me().then(r=>setProfile(r.data as Profile)).catch(()=>undefined)},[]);
  if(!data&&!error)return <OverviewSkeleton/>;
  if(error)return <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:m-8">Could not load the command center: {error}</div>;
  const m=data!.metrics,v=data!.volumesNgn;
  const stats:Array<[string,string,string]>=[
    ["Total payment volume",formatCurrency(v.totalProcessed,"NGN"),`${m.totalTransactions.toLocaleString()} successful and failed transactions`],
    ["Wallet float (customer funds)",formatCurrency(m.walletFloat,"NGN"),"Available, pending and held balances"],
    ["Monthly active users",m.monthlyActiveUsers.toLocaleString(),`From the selected ${days}-day period`],
    ["Active Ajo groups",m.activeAjoGroups.toLocaleString(),"Open, locked and active groups"],
    ["Ajo contributions collected",formatCurrency(v.ajoContributions,"NGN"),"Successful contribution payments"],
    ["Payouts completed",formatCurrency(v.ajoPayouts,"NGN"),"Verified paid Ajo payouts"],
    ["Platform fee revenue",formatCurrency(v.feeRevenue,"NGN"),"Fees from successful transactions"],
    ["Contribution collection rate",`${m.contributionCollectionRate.toFixed(1)}%`,`${m.failureRate} transaction failure rate`],
  ];
  const attention=[
    {label:"Payout approvals",count:data!.attention.payoutApprovals.count,hint:`${formatCurrency(data!.attention.payoutApprovals.amount,"NGN")} waiting`,href:"/payout-approvals",danger:false},
    {label:"KYC reviews",count:data!.attention.kycReviews.count,hint:age(data!.attention.kycReviews.oldestAt),href:"/kyc",danger:false},
    {label:"Risk alerts",count:data!.attention.riskAlerts.count,hint:"Open and investigating alerts",href:"/compliance",danger:true},
    {label:"Recon breaks",count:data!.attention.reconciliationBreaks.count,hint:`${formatCurrency(data!.attention.reconciliationBreaks.amount,"NGN")} unmatched`,href:"/reconciliation",danger:false},
    {label:"Disputes",count:data!.attention.disputes.count,hint:"Open customer cases",href:"/disputes",danger:false},
    {label:"Community verifications",count:data!.attention.communityVerifications.count,hint:"Awaiting review",href:"/communities",danger:false},
  ];
  const name=profile?.firstName||"Admin";
  return <div className="min-w-0 flex-1 bg-[#F8FAFC]"><Topbar profile={profile}/><main className="mx-auto max-w-[1240px] space-y-4 px-4 py-5 sm:px-6 lg:px-8"><section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-[26px] font-bold tracking-[-0.035em] text-[#0F172A]">Good {greeting()}, {name}</h1><p className="mt-1 text-xs text-[#64748B]">{new Intl.DateTimeFormat("en-NG",{dateStyle:"full"}).format(new Date())} · live platform data</p></div><div className="flex gap-2"><select value={days} onChange={e=>setDays(Number(e.target.value))} className="h-10 rounded-lg border border-[#E3E8F0] bg-white px-3 text-xs"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><button onClick={()=>downloadDashboard(data!)} className="h-10 rounded-lg border border-[#94A3B8] bg-white px-4 text-xs font-bold">⇩ Export report</button></div></section><section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label,value,hint])=><article key={label} className="rounded-xl border border-[#E3E8F0] bg-white p-4"><p className="text-[11px] text-[#475569]">{label}</p><strong className="mt-2 block text-[23px] leading-none tracking-[-0.03em] text-[#0F172A]">{value}</strong><p className="mt-3 text-[10px] text-[#64748B]">{hint}</p></article>)}</section><section className="grid gap-4 xl:grid-cols-[2fr_1fr]"><article className="rounded-xl border border-[#E3E8F0] bg-white p-4 sm:p-5"><h2 className="text-sm font-bold">Payment volume vs Ajo contributions (NGN / day)</h2><VolumeChart series={data!.trends.series}/></article><article className="rounded-xl border border-[#E3E8F0] bg-white p-4 sm:p-5"><h2 className="mb-2 text-sm font-bold">Needs your attention</h2>{attention.map(item=><Link href={item.href} key={item.label} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">◇</span><span className="min-w-0 flex-1"><b className="block text-xs">{item.label}</b><small className="block truncate text-[10px] text-[#64748B]">{item.hint}</small></span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${item.danger?"bg-red-600":"bg-[#2563EB]"}`}>{item.count}</span><span>›</span></Link>)}</article></section><section className="grid gap-4 lg:grid-cols-3"><article className="rounded-xl border border-[#E3E8F0] bg-white p-5"><h2 className="text-sm font-bold">Providers & system</h2><div className="mt-3 space-y-3">{data!.providers.map(p=><div className="flex items-center gap-2 text-[11px]" key={p.id}><b className="min-w-0 flex-1">{p.name}</b>{p.isDefault&&<span className="text-slate-500">Default</span>}<span className={`rounded-full px-2 py-1 font-bold ${p.isActive?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700"}`}>● {p.isActive?"Operational":"Disabled"}</span></div>)}{!data!.providers.length&&<p className="text-xs text-slate-500">No payment providers configured.</p>}</div></article><article className="rounded-xl border border-[#E3E8F0] bg-white p-5"><h2 className="text-sm font-bold">Top communities by volume</h2>{data!.topCommunities.map((community,index)=><div className="mt-3 flex gap-2 text-[11px]" key={community.id}><span>{index+1}</span><span className="flex-1">{community.name}</span><b>{formatCurrency(community.volumeNgn,"NGN")}</b></div>)}{!data!.topCommunities.length&&<p className="mt-4 text-xs text-slate-500">No community transaction volume in this period.</p>}</article><ChannelCard channels={data!.signupChannels}/></section></main></div>
}

function Topbar({profile}:{profile:Profile|null}){void profile;return null}
function VolumeChart({series}:{series:Dashboard["trends"]["series"]}){const max=Math.max(1,...series.flatMap(x=>[x.paymentVolumeNgn,x.ajoContributionsNgn]));const points=(key:"paymentVolumeNgn"|"ajoContributionsNgn")=>series.map((x,i)=>`${(i/Math.max(1,series.length-1))*100},${92-(x[key]/max)*75}`).join(" ");return <div className="mt-4"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[210px] w-full">{[20,40,60,80].map(y=><line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#E3E8F0" strokeWidth=".35"/>)}<polyline points={points("paymentVolumeNgn")} fill="none" stroke="#059669" strokeWidth="1.1" vectorEffect="non-scaling-stroke"/><polyline points={points("ajoContributionsNgn")} fill="none" stroke="#2563EB" strokeWidth="1.1" vectorEffect="non-scaling-stroke"/></svg><div className="flex justify-between text-[10px] text-slate-500"><span>{series[0]?.date??""}</span><span>{series.at(-1)?.date??""}</span></div></div>}
function ChannelCard({channels}:{channels:Record<string,number>}){const total=Math.max(1,Object.values(channels).reduce((sum,n)=>sum+n,0));return <article className="rounded-xl border border-[#E3E8F0] bg-white p-5"><h2 className="text-sm font-bold">New signups by channel</h2><p className="mt-1 text-[11px] text-slate-500">{total.toLocaleString()} in selected period</p><div className="mt-5 flex h-36 items-end gap-3">{Object.entries(channels).map(([name,count])=>{const percent=Math.round(count/total*100);return <div className="flex h-full flex-1 flex-col justify-end text-center text-[9px] text-slate-500" key={name}><span>{percent}%</span><div className="mt-1 min-h-1 rounded-t bg-blue-600" style={{height:`${Math.max(4,percent*2.4)}px`}}/><span className="mt-1 capitalize">{name}</span></div>})}</div></article>}
function OverviewSkeleton(){return <div className="p-4 sm:p-8"><div className="h-12 animate-pulse rounded-xl bg-slate-200"/><div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:8},(_,i)=><div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200"/>)}</div></div>}
function greeting(){const hour=new Date().getHours();return hour<12?"morning":hour<17?"afternoon":"evening"}
function age(value:string|null){if(!value)return"No waiting records";const hours=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/3_600_000));return `Oldest waiting ${hours}h`}
function downloadDashboard(data:Dashboard){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`rendi-dashboard-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url)}
