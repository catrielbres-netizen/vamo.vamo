import React from 'react';
import LoginPageClient from './LoginPageClient';

export default function RootLoginPage({
    searchParams,
}: {
    searchParams: { role?: string };
}) {
    const role = searchParams?.role;
    const fixedRole = role === 'driver' || role === 'passenger' ? role : undefined;

    return <LoginPageClient fixedRole={fixedRole} />;
}
