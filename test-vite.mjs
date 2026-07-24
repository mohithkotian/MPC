import http from 'http';

const req = http.request('http://127.0.0.1:3000/api/auth/refresh', { method: 'POST' }, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});
req.on('error', console.error);
req.end();
