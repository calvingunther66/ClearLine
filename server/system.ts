import os from 'os';

export function getSystemStats() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  
  // Calculate CPU Usage
  // This is a snapshot, for real usage we'd need to compare two snapshots.
  // For simplicity, we'll just return the load average (1 min) normalized by core count
  // or just return the number of cores and model for now.
  // Actually, let's try to calculate usage from times.
  
  const cpuUsage = cpus.map(cpu => {
    const total = Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0);
    const idle = cpu.times.idle;
    return { total, idle };
  });

  return {
    cpu: {
      cores: cpus.length,
      model: cpus[0].model,
      loadAvg: os.loadavg(), // [1min, 5min, 15min]
      usage: cpuUsage
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem
    },
    uptime: os.uptime()
  };
}
