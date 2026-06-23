const fs = require('fs');

const file = 'c:\\Users\\catri\\vamo.vamo\\src\\app\\driver\\muni-status\\page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\r\n/g, '\n');

if (!content.includes('@/components/ui/tabs')) {
    content = content.replace(
        "import { LazyQRCode } from '@/components/LazyQRCode';",
        "import { LazyQRCode } from '@/components/LazyQRCode';\nimport { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';"
    );
}

const startToken = '    return (\n        <div className="space-y-5 pb-10">';
const endToken = '    );\n}\n';

const startIndex = content.indexOf(startToken);
const endIndex = content.lastIndexOf(endToken);

if (startIndex === -1 || endIndex === -1) {
    console.error("Tokens not found!");
    process.exit(1);
}

const before = content.slice(0, startIndex);
const returnBlock = content.slice(startIndex, endIndex);
const after = content.slice(endIndex);

const marker1 = '{/* TRAFFIC OBSERVATIONS BLOCK */}';
const marker2 = '{/* ── CHECKLIST DOCUMENTAL (solo visible si no está activo) ──── */}';
const marker3 = '{/* ── CANON MUNICIPAL ─────────────────────────────────────────── */}';
const marker4 = '{/* ── AYUDA ───────────────────────────────────────────────────── */}';

const part1 = returnBlock.slice(0, returnBlock.indexOf(marker1));
const part2 = returnBlock.slice(returnBlock.indexOf(marker1), returnBlock.indexOf(marker2));
const part3 = returnBlock.slice(returnBlock.indexOf(marker2), returnBlock.indexOf(marker3));
const part4 = returnBlock.slice(returnBlock.indexOf(marker3), returnBlock.indexOf(marker4));
const part5 = returnBlock.slice(returnBlock.indexOf(marker4));

const tabsHeader = `            <Tabs defaultValue="estado" className="w-full">
                <TabsList className="w-full grid grid-cols-3 h-auto sm:h-14 bg-zinc-900/50 rounded-2xl p-1 gap-1 mb-6 overflow-x-auto">
                    <TabsTrigger value="estado" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 sm:py-0">Estado</TabsTrigger>
                    <TabsTrigger value="docs" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 sm:py-0">Mis Docs</TabsTrigger>
                    <TabsTrigger value="gestion" className="rounded-xl font-bold text-[10px] sm:text-xs py-2 sm:py-0">Renovar</TabsTrigger>
                </TabsList>

                <TabsContent value="estado" className="space-y-5 animate-in fade-in duration-300">\n`;

const tabsEnd1 = `                </TabsContent>

                <TabsContent value="docs" className="space-y-5 animate-in fade-in duration-300">\n`;

const tabsEnd2 = `                </TabsContent>

                <TabsContent value="gestion" className="space-y-5 animate-in fade-in duration-300">\n`;

const tabsEnd3 = `                </TabsContent>
            </Tabs>\n\n`;

const newReturnBlock = part1 + tabsHeader + part2 + tabsEnd1 + part3 + tabsEnd2 + part4 + tabsEnd3 + part5;

fs.writeFileSync(file, before + newReturnBlock + after);
console.log('Success!');
