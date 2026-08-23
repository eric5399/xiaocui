"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import { ensureAnonymousSession } from "./auth-client";
import { H5Frame,LoadingPanel } from "./H5Frame";
export function AccessClaim({token}:{token:string}){const router=useRouter(),[error,setError]=useState("");useEffect(()=>{let active=true;(async()=>{try{const session=await ensureAnonymousSession();if(!session) throw new Error("当前为本地演示环境，请使用演示邀请码进入。");const response=await fetch('/api/participant-access/claim',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({token})});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'参与链接无效');if(active)router.replace(`/t/${body.data.invite_code}`);}catch(e){if(active)setError(e instanceof Error?e.message:'参与链接无法使用');}})();return()=>{active=false};},[router,token]);return <H5Frame quietHeader>{error?<section><h1>无法进入任务</h1><p>{error}</p></section>:<LoadingPanel label="正在安全进入任务"/>}</H5Frame>}
