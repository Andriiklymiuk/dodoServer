import { Hono } from 'hono'
import { ServerWebSocket } from 'bun';

const app = new Hono()

interface TodoItem {
  id: string;
  label: string;
  checked?: boolean;
}

const todos: TodoItem[] = [];

const wsClients: Set<ServerWebSocket> = new Set();

// Logging middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  console.log(`${c.req.method} ${c.req.url} ${c.res.status} - ${duration}ms`);
});

// CORS middleware for local development
app.use('*', async (c, next) => {
  c.res.headers.set('Access-Control-Allow-Origin', '*');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (c.req.method === 'OPTIONS') {
    return new Response('OK', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  await next();
});

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.post('/todos', async (c) => {
  const todo = await c.req.json();
  todos.push(todo);
  wsClients.forEach(client => {
    client.send(JSON.stringify({ action: 'postTodo', data: todo }));
  });
  return c.json(todo);
});

app.delete('/todos/:id', (c) => {
  const { id } = c.req.param();
  const index = todos.findIndex((todo) => todo.id === id);
  if (index > -1) {
    todos.splice(index, 1);
    wsClients.forEach(client => {
      client.send(JSON.stringify({ action: 'deleteTodo', data: { id } }));
    });
    return c.json({ message: 'Todo removed' });
  }
  return c.json({ message: 'Todo not found' }, 404);
});

app.put('/todos/:id', async (c) => {
  const { id } = c.req.param();
  const todoUpdate = await c.req.json();
  const index = todos.findIndex((todo) => todo.id === id);
  if (index > -1) {
    const updatedTodo = { ...todos[index], ...todoUpdate };
    todos[index] = updatedTodo;
    wsClients.forEach(client => {
      client.send(JSON.stringify({ action: 'updateTodo', data: updatedTodo }));
    });
    return c.json(todos[index]);
  }
  return c.json({ message: 'Todo not found' }, 404);
});

app.patch('/todos/:id/toggle', (c) => {
  const { id } = c.req.param();
  const index = todos.findIndex((todo) => todo.id === id);
  if (index > -1) {
    todos[index].checked = !todos[index].checked;
    wsClients.forEach(client => {
      client.send(JSON.stringify({ action: 'toggleTodo', data: { id } }));
    });
    return c.json(todos[index]);
  }
  return c.json({ message: 'Todo not found' }, 404);
});

app.get('/todos', (c) => {
  return c.json(todos);
});

Bun.serve({
  fetch: (req, server) => {
    if (server.upgrade(req)) {
      // handle authentication
    }
    return app.fetch(req, server)
  },
  websocket: {
    message(ws, message) {

    },
    open(ws: ServerWebSocket) {
      ws.send(JSON.stringify({ action: 'init', data: todos }));
      // Add the new WebSocket connection to the clients store
      wsClients.add(ws);
    },
    close(ws: ServerWebSocket, code, message) {
      wsClients.delete(ws);
    },
    drain(ws) { }
  },
  port: process.env.PORT || 3000
})

