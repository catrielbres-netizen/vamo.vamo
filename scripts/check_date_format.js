
const d = new Date();
const opt = { timeZone: 'America/Argentina/Buenos_Aires' };
const s1 = new Intl.DateTimeFormat('en-CA', opt).format(d);
const s2 = d.toLocaleDateString('en-CA', opt);

console.log(`Intl: "${s1}" (length: ${s1.length})`);
console.log(`Locale: "${s2}" (length: ${s2.length})`);
console.log(`Match: ${s1 === s2}`);

for(let i=0; i<s1.length; i++) console.log(`s1[${i}]: ${s1.charCodeAt(i)}`);
for(let i=0; i<s2.length; i++) console.log(`s2[${i}]: ${s2.charCodeAt(i)}`);
