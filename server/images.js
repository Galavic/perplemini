const MAX_IMAGE_BYTES=5*1024*1024;
const MIME_TYPES=['image/png','image/jpeg','image/webp','image/gif'];

export function validateImages(images){
  if(!Array.isArray(images)||images.length>8)throw new Error('Attach up to 8 images per message.');
  let totalBytes=0;
  return images.map(image=>{
    if(!image||!MIME_TYPES.includes(image.mime)||typeof image.data!=='string'||!image.data.length||image.data.length>Math.ceil(MAX_IMAGE_BYTES/3)*4||image.data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))throw new Error('Invalid image. Use PNG, JPG, WebP or GIF up to 5 MB.');
    const bytes=Buffer.from(image.data,'base64');
    totalBytes+=bytes.length;
    if(totalBytes>20*1024*1024)throw new Error('Images can total up to 20 MB per message.');
    const matches={
      'image/png':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      'image/jpeg':bytes[0]===255&&bytes[1]===216&&bytes[2]===255,
      'image/webp':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP',
      'image/gif':/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)),
    };
    if(bytes.length>MAX_IMAGE_BYTES||!matches[image.mime])throw new Error('The file content does not match a valid image.');
    return {mime:image.mime,data:image.data,name:typeof image.name==='string'?image.name.slice(0,200):'image'};
  });
}
