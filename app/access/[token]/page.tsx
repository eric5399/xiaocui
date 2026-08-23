import { AccessClaim } from "@/components/h5/AccessClaim";
export default async function AccessPage({params}:{params:Promise<{token:string}>}){return <AccessClaim token={(await params).token}/>;}
