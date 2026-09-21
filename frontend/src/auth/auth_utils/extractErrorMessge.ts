// Message from an Axios-style error, an Error or a fallback, checked structurally so no axios import is needed.
export const extractErrorMessage =(err:unknown):string=>{
// Axios-style error: the server's message is in response.data.message.
if(err && typeof err==='object' &&
 'response' in err &&
 err.response &&
 typeof err.response ==='object' &&
 'data' in err.response &&
 err.response.data  &&
 typeof err.response.data === 'object' &&
 'message' in err.response.data
){
  return String(err.response.data.message);
}

if(err instanceof Error){
 return err.message;
}
return 'An unexpected error occurred';
}
