'use client';
import { redirect } from 'next/navigation';

export default function DriverPageRedirect() {
    redirect('/driver/rides');
}
