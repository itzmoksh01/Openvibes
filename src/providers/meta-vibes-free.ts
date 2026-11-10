import type {CreativeProvider,ProviderCapabilities} from './provider-interface.js';
import type {JobKind} from '../types.js';
/** Evidence-gated adapter. Public consumer Vibes features do not prove an authorized unattended API exists for free accounts. */
export class MetaVibesFreeProvider implements CreativeProvider {
 readonly id='meta-vibes-free';
 async getCapabilities():Promise<ProviderCapabilities>{return {provider:this.id,status:'BLOCKED',imageGeneration:false,videoGeneration:false,imageToVideo:false,freePlan:'unknown',unattended:false,reason:'No documented and authorized unattended generation API for a standard free Vibes account has been verified. Provider is intentionally disabled; no paid API or private endpoint is used.',evidenceUrl:['https://ai.meta.com/meta-ai/vibes/','https://about.fb.com/news/2025/09/introducing-vibes-ai-videos/']};}
 async generate(_kind:JobKind,_input:Record<string,unknown>):Promise<never>{throw new Error('META_VIBES_AUTOMATION_UNVERIFIED: No authorized unattended free-Vibes interface has been verified.');}
}
