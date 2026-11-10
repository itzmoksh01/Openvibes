export type JobState = 'QUEUED' | 'VALIDATING' | 'AUTHENTICATING' | 'SUBMITTING' | 'SUBMITTED' | 'PROCESSING' | 'COMPLETED' | 'DOWNLOADING' | 'VERIFYING' | 'SAVED' | 'FAILED' | 'CANCELLED' | 'RATE_LIMITED' | 'BLOCKED';
export type JobKind = 'image' | 'video' | 'image-to-video' | 'audio';
export interface JobRecord { id:string; kind:JobKind; state:JobState; provider:string; prompt:string; optimizedPrompt:string; inputJson:string; outputJson:string|null; errorCode:string|null; errorMessage:string|null; createdAt:string; updatedAt:string; }
export interface AssetRecord { id:string; jobId:string; filename:string; mimeType:string; sizeBytes:number; sha256:string; path:string; metadataJson:string; createdAt:string; }
