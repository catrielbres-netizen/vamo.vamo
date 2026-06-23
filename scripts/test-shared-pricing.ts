import { calculateSharedPricing } from '../functions/src/lib/sharedPricing';

function simulateSharedRide(passengers: { name: string, individualFare: number }[]) {
    const passengerCount = passengers.length;
    console.log(`\n--- Simulando Viaje Compartido con ${passengerCount} pasajeros ---`);

    let groupGrossAmount = 0;
    const results = passengers.map(p => {
        // Mock request object needed for calculateSharedPricing
        const mockRequest: any = {
            id: 'req_' + p.name,
            passengerId: 'pax_' + p.name,
            individualFareReference: p.individualFare
        };

        const pricing = calculateSharedPricing(
            mockRequest,
            mockRequest, // creator
            passengerCount,
            passengerCount,
            { base: 100, perKm: 50, perMin: 10 } as any // dummy config, not used for the multiplier logic actually, it uses the individualFareReference
        );

        groupGrossAmount += pricing.sharedFarePerPassenger;

        return {
            name: p.name,
            individualFare: p.individualFare,
            sharedFare: pricing.sharedFarePerPassenger,
            savings: pricing.passengerSavingAmount,
            savingsPercent: pricing.passengerSavingPercent
        };
    });

    console.table(results);
    console.log(`\nTotal bruto del grupo (groupGrossAmount): $${groupGrossAmount}`);

    // Settlement
    const totalCommissionRate = 0.10;
    const totalCommissionAmount = Math.round(groupGrossAmount * totalCommissionRate);
    const vamoNetAmount = Math.round(groupGrossAmount * 0.06);
    const municipalAmount = Math.round(groupGrossAmount * 0.02);
    const taxiAssociationAmount = Math.round(groupGrossAmount * 0.01);
    const remisAssociationAmount = Math.round(groupGrossAmount * 0.01);
    const totalAssociationsAmount = taxiAssociationAmount + remisAssociationAmount;
    const driverNetAfterCommission = groupGrossAmount - totalCommissionAmount;

    console.log(`Liquidación (10%):`);
    console.log(`- Conductor Neto (90%): $${driverNetAfterCommission}`);
    console.log(`- VamO (6%): $${vamoNetAmount}`);
    console.log(`- Municipalidad (2%): $${municipalAmount}`);
    console.log(`- Asoc. Taxis (1%): $${taxiAssociationAmount}`);
    console.log(`- Asoc. Remises (1%): $${remisAssociationAmount}`);
    console.log(`Validación suma comisiones: ${vamoNetAmount + municipalAmount + taxiAssociationAmount + remisAssociationAmount} == ${totalCommissionAmount}`);
}

simulateSharedRide([
    { name: 'Pasajero A', individualFare: 5000 },
    { name: 'Pasajero B', individualFare: 8000 }
]);

simulateSharedRide([
    { name: 'Pasajero A', individualFare: 4000 },
    { name: 'Pasajero B', individualFare: 6000 },
    { name: 'Pasajero C', individualFare: 5500 }
]);

simulateSharedRide([
    { name: 'Pasajero A', individualFare: 3000 },
    { name: 'Pasajero B', individualFare: 4500 },
    { name: 'Pasajero C', individualFare: 7000 },
    { name: 'Pasajero D', individualFare: 5000 }
]);
