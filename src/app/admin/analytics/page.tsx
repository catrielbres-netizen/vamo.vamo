'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot, 
    Timestamp,
    getDocs,
    getCountFromServer
} from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { 
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";



export default function AdminAnalyticsPage() {
    const firestore = useFirestore();
    const { cityKey: activeCityKey, cityName } = useMunicipalContext();
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('7d');
    const [chartData, setChartData] = useState<any[]>([]);
    const [geoData, setGeoData] = useState<any[]>([]);
    
    const [stats, setStats] = useState({
        dau: 0,
        mau: 0,
        growthRate: '+12.5%',
        retentionRate: '84%',
        avgMatchingTime: '42s',
        cancellationRate: '4.2%',
        totalGmv: 2450800,
        avgTicket: 3450
    });

    useEffect(() => {
        if (!firestore) return;

        const fetchRealStats = async () => {
            try {
                const now = new Date();
                const startOfPeriod = new Date();
                if (timeRange === '24h') startOfPeriod.setHours(now.getHours() - 24);
                else if (timeRange === '7d') startOfPeriod.setDate(now.getDate() - 7);
                else if (timeRange === '30d') startOfPeriod.setDate(now.getDate() - 30);
                else startOfPeriod.setFullYear(now.getFullYear() - 1);

                const dayStringLimit = startOfPeriod.toISOString().split('T')[0];

                let targetCollection = activeCityKey ? 'city_metrics_daily' : 'platform_metrics_daily';
                let qMetrics = activeCityKey 
                    ? query(collection(firestore, targetCollection), where('cityKey', '==', activeCityKey), where('dayId', '>=', dayStringLimit), orderBy('dayId', 'asc'))
                    : query(collection(firestore, targetCollection), where('dayId', '>=', dayStringLimit), orderBy('dayId', 'asc'));

                const metricsSnap = await getDocs(qMetrics);
                
                let accumulatedRides = 0;
                let accumulatedGMV = 0;
                let peakDau = 0;
                const newChartData: any[] = [];
                
                metricsSnap.forEach(doc => {
                    const data = doc.data();
                    const s = data.stats || {};
                    accumulatedRides += (s.ridesCount || 0);
                    accumulatedGMV += (s.totalGMV || 0);
                    peakDau = Math.max(peakDau, s.peakDrivers || 0);
                    
                    const dateObj = new Date(data.dayId + 'T12:00:00Z');
                    const daysStr = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
                    
                    newChartData.push({
                        name: daysStr[dateObj.getDay()],
                        rides: s.ridesCount || 0,
                        users: s.peakDrivers || 0,
                        revenue: s.totalGMV || 0,
                    });
                });

                setChartData(newChartData);

                // Fetch current Active Users from telemetry or drivers_locations
                const qDau = activeCityKey
                    ? query(collection(firestore, 'drivers_locations'), where('cityKey', '==', activeCityKey), where('driverStatus', 'in', ['online', 'in_ride']))
                    : query(collection(firestore, 'drivers_locations'), where('driverStatus', 'in', ['online', 'in_ride']));
                
                const dauSnap = await getCountFromServer(qDau);
                const currentOnline = dauSnap.data().count;

                setStats(prev => ({
                    ...prev,
                    dau: Math.max(currentOnline, peakDau), // Historical peak vs current realtime
                    totalRides: accumulatedRides,
                    totalGmv: accumulatedGMV,
                }));

                // Geo Distribution (Only when Global)
                if (!activeCityKey) {
                    const geoQuery = query(collection(firestore, 'cities'));
                    const geoSnap = await getDocs(geoQuery);
                    const geoArr: any[] = [];
                    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
                    let colorIdx = 0;
                    
                    for (const doc of geoSnap.docs) {
                         const cityId = doc.id;
                         const cName = doc.data().name || cityId;
                         const qCR = query(collection(firestore, 'city_metrics_daily'), where('cityKey', '==', cityId), orderBy('dayId', 'desc'), limit(1));
                         const qcrSnap = await getDocs(qCR);
                         let val = 0;
                         if (!qcrSnap.empty) {
                             val = qcrSnap.docs[0].data().stats?.ridesCount || 0;
                         }
                         if (val > 0) {
                             geoArr.push({ name: cName, value: val, cityKey: cityId, color: colors[colorIdx++ % colors.length] });
                         }
                    }
                    setGeoData(geoArr);
                }

            } catch (err) {
                console.error("[ANALYTICS_FETCH_ERROR]", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRealStats();
    }, [firestore, activeCityKey, timeRange]);

    if (loading) {
        return (
            <div className="p-8 space-y-8 max-w-7xl mx-auto">
                <div className="flex justify-between items-end">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-10 w-64" />
                    </div>
                    <Skeleton className="h-10 w-48" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-[2rem]" />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Skeleton className="h-80 rounded-[2.5rem]" />
                    <Skeleton className="h-80 rounded-[2.5rem]" />
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                            Operational Intelligence
                        </span>
                        {activeCityKey && (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 uppercase font-black text-[10px] tracking-widest px-3">
                                {cityName}
                            </Badge>
                        )}
                    </div>
                    <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none">
                        VamO <span className="text-indigo-500">Analytics</span>
                    </h1>
                    <p className="text-zinc-500 text-sm mt-2 font-medium">Análisis profundo de demanda, oferta y eficiencia de red.</p>
                </div>

                <div className="flex gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-white/5 shadow-2xl">
                    {['24h', '7d', '30d', 'all'].map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                timeRange === range 
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                                    : "text-zinc-500 hover:text-white hover:bg-white/5"
                            )}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                    label="Active Users (DAU)" 
                    value={stats.dau || 0} 
                    trend="Live" 
                    icon="users" 
                    color="indigo" 
                />
                <MetricCard 
                    label="Matching Efficiency" 
                    value={stats.avgMatchingTime} 
                    trend="-12s" 
                    icon="zap" 
                    color="emerald" 
                    sub="Tiempo promedio de respuesta"
                />
                <MetricCard 
                    label="Total Rides" 
                    value={(stats as any).totalRides || 0} 
                    trend="Real-time" 
                    icon="trending-up" 
                    color="amber" 
                />
                <MetricCard 
                    label="Retention Rate" 
                    value={stats.retentionRate} 
                    trend="Stable" 
                    icon="heart" 
                    color="red" 
                />
            </div>

            <Tabs defaultValue="demand" className="w-full">
                <TabsList className="bg-zinc-950 border border-white/5 p-1.5 rounded-[1.5rem] h-auto mb-8">
                    <TabsTrigger value="demand" className="px-6 py-3 rounded-xl data-[state=active]:bg-white/5 data-[state=active]:text-white text-zinc-500 font-black uppercase tracking-widest text-[10px]">
                        Demanda & Crecimiento
                    </TabsTrigger>
                    <TabsTrigger value="efficiency" className="px-6 py-3 rounded-xl data-[state=active]:bg-white/5 data-[state=active]:text-white text-zinc-500 font-black uppercase tracking-widest text-[10px]">
                        Eficiencia Operativa
                    </TabsTrigger>
                    <TabsTrigger value="geo" className="px-6 py-3 rounded-xl data-[state=active]:bg-white/5 data-[state=active]:text-white text-zinc-500 font-black uppercase tracking-widest text-[10px]">
                        Distribución Geo
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="demand" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ChartContainer title="Crecimiento de Usuarios & Viajes" description="Evolución diaria de registros vs demanda real.">
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorRides" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                    <XAxis dataKey="name" stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} />
                                    <YAxis stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#09090b', border: '1px solid #ffffff10', borderRadius: '16px' }}
                                        itemStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase' }}
                                    />
                                    <Area type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" />
                                    <Area type="monotone" dataKey="rides" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRides)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartContainer>

                        <ChartContainer title="Volumen de Ingresos (GMV)" description="Facturación total bruta generada por el sistema.">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                    <XAxis dataKey="name" stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} />
                                    <YAxis stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                                    <Tooltip 
                                        cursor={{ fill: '#ffffff05' }}
                                        contentStyle={{ backgroundColor: '#09090b', border: '1px solid #ffffff10', borderRadius: '16px' }}
                                        formatter={(v: any) => [`$${v.toLocaleString()}`, 'Revenue']}
                                    />
                                    <Bar dataKey="revenue" fill="#6366f1" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </div>
                </TabsContent>

                <TabsContent value="efficiency" className="space-y-6">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-8 rounded-[2.5rem] bg-zinc-900/50 border border-white/5 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 flex items-center justify-center mb-4">
                                <VamoIcon name="zap" className="w-8 h-8 text-indigo-500" />
                            </div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Tasa de Aceptación</h3>
                            <p className="text-4xl font-black italic tracking-tighter">92.4%</p>
                            <p className="text-xs text-emerald-500 font-bold mt-2 uppercase tracking-tighter">Alta eficiencia de red</p>
                        </div>
                        <div className="p-8 rounded-[2.5rem] bg-zinc-900/50 border border-white/5 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center mb-4">
                                <VamoIcon name="x-circle" className="w-8 h-8 text-red-500" />
                            </div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Tasa de Cancelación</h3>
                            <p className="text-4xl font-black italic tracking-tighter">3.8%</p>
                            <p className="text-xs text-zinc-500 font-bold mt-2 uppercase tracking-tighter">Bajo el umbral crítico</p>
                        </div>
                        <div className="p-8 rounded-[2.5rem] bg-zinc-900/50 border border-white/5 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center mb-4">
                                <VamoIcon name="clock" className="w-8 h-8 text-amber-500" />
                            </div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Tiempo de Pickup</h3>
                            <p className="text-4xl font-black italic tracking-tighter">4.2m</p>
                            <p className="text-xs text-amber-500 font-bold mt-2 uppercase tracking-tighter">Optimización en curso</p>
                        </div>
                     </div>
                </TabsContent>

                <TabsContent value="geo" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ChartContainer title="Distribución por Ciudad" description="Cuota de mercado y actividad por jurisdicción.">
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={geoData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {geoData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#09090b', border: '1px solid #ffffff10', borderRadius: '16px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex justify-center flex-wrap gap-4 mt-4">
                                {geoData.length === 0 && <span className="text-xs text-zinc-600">No hay datos geográficos</span>}
                                {geoData.map(city => (
                                    <div key={city.name} className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: city.color }} />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{city.name}</span>
                                    </div>
                                ))}
                            </div>
                        </ChartContainer>

                        <div className="p-8 rounded-[2.5rem] bg-zinc-900/50 border border-white/5 flex flex-col items-center justify-center text-center">
                            <VamoIcon name="map" className="w-12 h-12 text-zinc-700 mb-4" />
                            <h3 className="text-lg font-black text-white italic tracking-tighter mb-2">Mapa de Calor Operativo</h3>
                            <p className="text-sm text-zinc-500 max-w-xs">Visualiza la densidad de pedidos en tiempo real para optimizar el posicionamiento de conductores.</p>
                            <Badge className="mt-4 bg-indigo-600 hover:bg-indigo-600 cursor-pointer uppercase font-black tracking-widest text-[10px]">
                                Abrir Live Heatmap
                            </Badge>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function MetricCard({ label, value, trend, icon, color, sub }: any) {
    const colors: any = {
        indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        red: 'bg-red-500/10 text-red-500 border-red-500/20',
    };

    return (
        <div className="p-6 rounded-[2.5rem] bg-zinc-900/50 border border-white/5 hover:bg-zinc-900 transition-all group overflow-hidden relative">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <VamoIcon name={icon} className="w-24 h-24" />
            </div>

            <div className="flex justify-between items-start mb-6">
                <div className={cn("p-3 rounded-2xl border", colors[color])}>
                    <VamoIcon name={icon} className="w-5 h-5" />
                </div>
                <Badge variant="outline" className={cn(
                    "text-[8px] font-black tracking-tighter uppercase",
                    trend.includes('+') ? "text-emerald-500 border-emerald-500/20" : "text-zinc-500 border-zinc-500/20"
                )}>
                    {trend}
                </Badge>
            </div>

            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">{label}</p>
            <p className="text-3xl font-black italic tracking-tighter text-white">{value}</p>
            {sub && <p className="text-[8px] text-zinc-600 font-bold uppercase mt-2">{sub}</p>}
        </div>
    );
}

function ChartContainer({ title, description, children }: any) {
    return (
        <Card className="bg-zinc-950/50 border-white/5 rounded-[2.5rem] overflow-hidden backdrop-blur-xl">
            <CardHeader className="p-8 pb-4">
                <CardTitle className="text-lg font-black italic tracking-tighter uppercase text-white">{title}</CardTitle>
                <CardDescription className="text-xs text-zinc-500 font-medium">{description}</CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-0">
                {children}
            </CardContent>
        </Card>
    );
}
