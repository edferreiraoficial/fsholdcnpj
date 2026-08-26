ssh -N `
  -o ServerAliveInterval=30 `
  -o ServerAliveCountMax=10 `
  -o ExitOnForwardFailure=yes `
  -p 65002 `
  -L 3307:127.0.0.1:3306 `
  u356706785@92.113.37.37
