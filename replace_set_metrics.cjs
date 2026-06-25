const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(path.join(__dirname, 'src/app/admin/dashboard/page.tsx'), 'utf8');

const regex = /setMetrics\(\{[\s\S]*?cancellationRate: 3\.8\r?\n\s*\}\);/;

const replacement = `setMetrics({
                totalDrivers: totalDriversCount,
                newDrivers: newDriversCount,
                pendingDrivers: realPendingCount,
                approvedDrivers: approvedCount,
                onlineDrivers: onlineCount,
                blockedDrivers: blockedDriversCount,
                mpLinkedDrivers: mpLinkedDrivers,
                mpUnlinkedDrivers: mpUnlinkedDrivers,
                
                totalPassengers: totalPassengersCount,
                newPassengers: newPassengersCount,
                onlinePassengers: onlinePassengersCount,
                blockedPassengers: blockedPassengersCount,
                
                totalRides: totalRidesCount as number,
                todayRides: completedTodayCount as number,
                completedRides: completedRidesCount as number,
                cancelledRides: cancelledRidesCount as number,
                activeRides: activeRidesCount as number,
                
                totalGmv: (ledgerData as any).total,
                todayGmv: (ledgerData as any).total, // Ledger calculates today
                vamoCommissions: (ledgerData as any).total * 0.15, // Example 15% 
                walletRecharges: 0, // Pending feature implementation
                avgTicket: (ledgerData as any).count > 0 ? (ledgerData as any).total / (ledgerData as any).count : 0,
                
                pendingWithdrawals: withdrawalsCount as number,
                newFapClaims: fapNuevos as number,
                pendingFapClaims: fapPendientes as number,
                
                citiesWithRecords: citiesWithRecords,
                activeCities: citiesWithRecords, // Temp mock
                citiesWithoutPanel: 0
            });`;

if (!regex.test(content)) {
    console.log("Not found regex for setMetrics");
    process.exit(1);
}

fs.writeFileSync(path.join(__dirname, 'src/app/admin/dashboard/page.tsx'), content.replace(regex, replacement));
console.log("Success setMetrics");
