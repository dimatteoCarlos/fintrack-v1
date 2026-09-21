// Renders nothing; loads the exchange rates once the user is authenticated.

import { useEffect } from 'react';
import { useCurrencyStore } from '../../stores/useCurrencyStore';
import { useAuthStore } from '../../../auth/stores/useAuthStore';

export function CurrencyInitializer() {
  // Subscribe only to fetchRates (not to rates, to avoid unnecessary re-renders)
  const fetchRates = useCurrencyStore((state) => state.fetchRates);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      console.log('💰 CurrencyInitializer: user authenticated, loading rates...');
      fetchRates();
    }
  }, [isAuthenticated, fetchRates]);

  return null;
}