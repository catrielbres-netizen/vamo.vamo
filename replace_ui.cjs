const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(path.join(__dirname, 'src/app/admin/dashboard/page.tsx'), 'utf8');

const regex = /return \([\s\S]*?\n\s*\);\n\}/m;

const replacement = `return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-3xl font-black">Dashboard Operativo</h1>
                        {activeCityKey && activeCityKey !== 'global' && activeCityKey !== 'all' && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 uppercase font-black text-[10px] tracking-widest px-3">
                                {cityName}
                            </Badge>
                        )}
                        {(!activeCityKey || activeCityKey === 'global' || activeCityKey === 'all') && (
                            <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 uppercase font-black text-[10px] tracking-widest px-3">
                                TODO VAMO
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">Estado de la plataforma en tiempo real.</p>
                </div>
                <button 
                    onClick={fetchMetrics}
                    disabled={loading}
                    className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    title="Actualizar"
                >
                    <VamoIcon name="rotate-ccw" className={cn("h-5 w-5", loading && "animate-spin")} />
                </button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="col-span-full mb-2 flex flex-col items-center justify-center p-8 border border-zinc-800/50 rounded-2xl bg-zinc-900/20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                        <p className="text-zinc-400 font-bold animate-pulse text-sm uppercase tracking-widest">
                            {(!activeCityKey || activeCityKey === 'global' || activeCityKey === 'all') ? "Calculando métricas nacionales (TODO VAMO)..." : "Cargando métricas de la ciudad..."}
                        </p>
                    </div>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <Skeleton key={i} className="h-32 rounded-2xl bg-zinc-900" />
                    ))}
                </div>
            ) : (
                <div className="space-y-8">
                    {/* FLOTA - CONDUCTORES */}
                    <div>
                        <h2 className="text-lg font-black mb-4 flex items-center gap-2"><VamoIcon name="car" className="h-5 w-5 text-indigo-500" /> Flota & Conductores</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <KPICard title="Total Conductores" value={metrics.totalDrivers} icon="users" color="indigo" description={\`Nuevos 30d: \${metrics.newDrivers}\`} link="/admin/drivers" />
                            <KPICard title="Conductores Online" value={metrics.onlineDrivers} icon="zap" color="emerald" description="Conectados ahora" />
                            <KPICard title="Altas Pendientes" value={metrics.pendingDrivers} icon="clock" color="amber" alert={metrics.pendingDrivers > 0} description="Esperando revisión" link="/admin/drivers" />
                            <KPICard title="Aprobados Activos" value={metrics.approvedDrivers} icon="user-check" color="blue" description={\`Bloqueados: \${metrics.blockedDrivers}\`} />
                            <KPICard title="Con MercadoPago" value={metrics.mpLinkedDrivers} icon="credit-card" color="green" description={\`Sin MP: \${metrics.mpUnlinkedDrivers}\`} />
                        </div>
                    </div>

                    {/* DEMANDA - PASAJEROS */}
                    <div>
                        <h2 className="text-lg font-black mb-4 flex items-center gap-2"><VamoIcon name="users" className="h-5 w-5 text-blue-500" /> Demanda & Pasajeros</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <KPICard title="Total Pasajeros" value={metrics.totalPassengers} icon="users" color="blue" description={\`Nuevos 30d: \${metrics.newPassengers}\`} link="/admin/passengers" />
                            <KPICard title="Pasajeros Online" value={metrics.onlinePassengers} icon="zap" color="emerald" description="Activos últimos 2 min" />
                            <KPICard title="Bloqueados" value={metrics.blockedPassengers} icon="ban" color="red" description="Cuentas suspendidas" />
                        </div>
                    </div>

                    {/* OPERACIONES - VIAJES */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <h2 className="text-lg font-black flex items-center gap-2"><VamoIcon name="map-pin" className="h-5 w-5 text-emerald-500" /> Operaciones & Viajes</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <KPICard title="Viajes Activos" value={metrics.activeRides} icon="activity" color="emerald" description="En curso ahora" alert={metrics.activeRides > 0} link="/admin/live-rides" />
                                <KPICard title="Viajes Hoy" value={metrics.todayRides} icon="calendar" color="blue" description="Creados hoy" />
                                <KPICard title="Viajes Históricos" value={metrics.totalRides} icon="bar-chart" color="zinc" description={\`Cancelados: \${metrics.cancelledRides}\`} />
                            </div>

                            <h2 className="text-lg font-black flex items-center gap-2 mt-8"><VamoIcon name="banknote" className="h-5 w-5 text-amber-500" /> Finanzas & GMV</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <KPICard title="GMV Hoy" value={\`$\${metrics.todayGmv.toLocaleString()}\`} icon="banknote" color="emerald" description={\`Ticket prom: $\${Math.round(metrics.avgTicket)}\`} />
                                <KPICard title="Retiros Pendientes" value={metrics.pendingWithdrawals} icon="landmark" color="amber" alert={metrics.pendingWithdrawals > 0} description="Solicitando cobro" link="/admin/withdrawals" />
                                <KPICard title="FAP Nuevos" value={metrics.newFapClaims} icon="shield-check" color={metrics.newFapClaims > 0 ? "red" : "blue"} description={\`\${metrics.pendingFapClaims} casos totales\`} alert={metrics.newFapClaims > 0} link="/admin/claims" />
                            </div>
                            
                            <h2 className="text-lg font-black flex items-center gap-2 mt-8"><VamoIcon name="globe" className="h-5 w-5 text-indigo-400" /> Red & Expansión</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <KPICard title="Ciudades Detectadas" value={metrics.citiesWithRecords} icon="map" color="indigo" description="Con algún usuario registrado" />
                                <KPICard title="Ciudades Sin Panel" value={metrics.citiesWithoutPanel} icon="alert-circle" color="zinc" description="Pendiente de configuración" />
                            </div>
                        </div>

                        {/* RIGHT: HEALTH & ALERTS */}
                        <div className="space-y-6">
                            <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl mt-11">
                                <CardHeader>
                                    <CardTitle className="text-lg">Salud de Red</CardTitle>
                                    <CardDescription>Drivers vs Demanda</CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col items-center justify-center py-6">
                                    <div className="text-4xl font-black mb-2 flex items-center gap-2">
                                        {metrics.onlineDrivers} <span className="text-zinc-600">/</span> {metrics.activeRides}
                                    </div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold text-center">Conductores Online<br/>vs<br/>Viajes Activos</p>
                                    
                                    <div className="mt-8 w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                                        <div 
                                            className={cn(
                                                "h-full transition-all duration-1000",
                                                metrics.onlineDrivers >= metrics.activeRides ? "bg-green-500" : "bg-red-500"
                                            )}
                                            style={{ width: \`\${Math.min(100, (metrics.onlineDrivers / (metrics.activeRides || 1)) * 100)}%\` }}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <SystemAlerts cityKey={activeCityKey || undefined} />
                        </div>
                    </div>
                </div>
            )}

            {/* ── ADMIN TOOLS ────────────────────── */}
            {(profile?.role === 'admin' || profile?.role === 'superadmin') && (
                <div className="mt-8 rounded-2xl border border-dashed border-rose-500/20 bg-rose-500/[0.03] p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-500/60 mb-3">🛠 Admin Tools — Retention Testing</p>
                    <div className="flex flex-col gap-2">
                        <RetentionTestButton />
                    </div>
                </div>
            )}

            {/* ── DEV TOOLS — solo visible en desarrollo ────────────────────── */}
            {isDev && (
                <div className="mt-4 rounded-2xl border border-dashed border-indigo-500/20 bg-indigo-500/[0.03] p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500/60 mb-3">🛠 Dev Tools — VamoMuni</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            disabled={devBusy}
                            onClick={async () => {
                                setDevBusy(true);
                                try {
                                    const { makeCurrentUserMunicipal } = await import('@/lib/dev/createMunicipalUser');
                                    await makeCurrentUserMunicipal('Rawson', 'rawson');
                                    toast({ title: '✅ Convertido en admin_municipal', description: 'Role: admin_municipal · Ciudad: Rawson · Recargá la página y andá a /municipal/login' });
                                } catch (e: any) {
                                    toast({ variant: 'destructive', title: 'Error', description: e.message });
                                } finally {
                                    setDevBusy(false);
                                }
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-black bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/20 rounded-xl transition-all disabled:opacity-50"
                        >
                            <VamoIcon name="landmark" className="h-3.5 w-3.5" />
                            {devBusy ? 'Convirtiendo...' : 'Convertirme en municipal (dev)'}
                        </button>
                        <Link href="/municipal/login">
                            <button className="flex items-center gap-2 px-4 py-2 text-xs font-black bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 rounded-xl transition-all">
                                <VamoIcon name="arrow-right" className="h-3.5 w-3.5" />
                                Ir a /municipal/login
                            </button>
                        </Link>
                    </div>
                    <p className="text-[10px] text-zinc-700 mt-2">Este panel NO aparece en producción (NODE_ENV !== 'development')</p>
                </div>
            )}
        </div>
    );
}`;

if (!regex.test(content)) {
    console.log("Not found regex for UI replace");
    process.exit(1);
}

fs.writeFileSync(path.join(__dirname, 'src/app/admin/dashboard/page.tsx'), content.replace(regex, replacement));
console.log("Success UI replace");
