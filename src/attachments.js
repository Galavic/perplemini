export const ATTACHMENT_ACCEPT='.txt,.md,.csv,.json,.log,.png,.jpg,.jpeg,.webp,.gif';

export async function readAttachment(file){
  const imageTypes={'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp','gif':'image/gif'};
  const extension=file.name.split('.').at(-1).toLowerCase();
  const mime=imageTypes[extension]||(['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)?file.type:null);
  if(mime){
    if(file.size>5*1024*1024)throw new Error('Images must be 5 MB or smaller.');
    const url=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(file);
    });
    const image=new Image();image.src=url;
    try{await image.decode();}catch{throw new Error('The image could not be opened. Use PNG, JPG, WebP or GIF.');}
    const canvas=document.createElement('canvas'),scale=Math.min(1,240/image.naturalWidth,180/image.naturalHeight);
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    return {name:file.name,kind:'image',mime,data:url.slice(url.indexOf(',')+1),preview:canvas.toDataURL('image/png')};
  }
  if(!/\.(txt|md|csv|json|log)$/i.test(file.name))throw new Error('Attach text files or PNG, JPG, WebP or GIF images.');
  if(file.size>60000)throw new Error('Text files must be smaller than 60 KB.');
  return {name:file.name,kind:'text',text:await file.text()};
}
