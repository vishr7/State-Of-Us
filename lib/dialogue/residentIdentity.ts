export function residentIdentity(id: string) {
  let seed = 0;
  for (const c of id) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
  const names = ['Alex','Sam','Morgan','Robin','Jamie','Casey','Taylor','Cameron','Avery','Jordan','Riley','Drew'];
  const surnames = ['Brooks','Chen','Rivera','Patel','Williams','Reed','Ortiz','Kim','Bennett','Shah','Davis','Ellis'];
  return { seed, name: `${names[seed % names.length]} ${surnames[Math.floor(seed / 13) % surnames.length]}` };
}
