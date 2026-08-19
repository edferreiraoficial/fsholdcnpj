import { Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Health = {
  api: boolean;
  database: { ok: boolean };
  tunnel: boolean;
  importer: { running: boolean; error?: string | null };
};

export default function HealthBar() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get('/health');
        if (active) setHealth(data);
      } catch {
        if (active) setHealth(null);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const status = (label: string, ok?: boolean, busy?: boolean) => (
    <Chip
      size="small"
      variant="outlined"
      label={`${label}: ${busy ? 'Processando' : ok ? 'Online' : 'Offline'}`}
    />
  );

  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <Typography variant="caption" color="text.secondary">Status</Typography>
      {status('API', !!health?.api)}
      {status('Banco/Túnel', !!health?.database?.ok)}
      {status('Importador', !!health, !!health?.importer?.running)}
    </Stack>
  );
}
