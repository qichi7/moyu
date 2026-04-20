/**
 * Pacman Game Leaderboard API - Cloudflare Worker
 * 
 * KV namespace binding: LEADERBOARD_KV
 * 
 * API endpoints:
 * - GET /api/leaderboard?type=all|today|week - 获取排行榜
 * - POST /api/leaderboard - 添加记录
 * - DELETE /api/leaderboard - 清空排行榜
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// JSON response helper
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

// Error response helper
function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

// Get date string
function getDateString() {
  return new Date().toLocaleDateString('zh-CN');
}

// Get timestamp
function getTimestamp() {
  return Date.now();
}

// Get leaderboard from KV
async function getLeaderboard(kv) {
  try {
    const data = await kv.get('leaderboard', { type: 'json' });
    return data || [];
  } catch (e) {
    console.error('Error getting leaderboard:', e);
    return [];
  }
}

// Save leaderboard to KV
async function saveLeaderboard(kv, data) {
  try {
    await kv.put('leaderboard', JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Error saving leaderboard:', e);
    return false;
  }
}

// Filter by date range
function filterByDateRange(data, type) {
  if (type === 'today') {
    const today = getDateString();
    return data.filter(entry => entry.date === today);
  }
  
  if (type === 'week') {
    const weekStart = getTimestamp() - 7 * 24 * 60 * 60 * 1000;
    return data.filter(entry => entry.timestamp >= weekStart);
  }
  
  return data; // 'all'
}

// Validate entry
function validateEntry(entry) {
  if (!entry.name || typeof entry.name !== 'string') {
    return false;
  }
  if (entry.name.length < 3 || entry.name.length > 12) {
    return false;
  }
  if (typeof entry.score !== 'number' || entry.score < 0) {
    return false;
  }
  if (typeof entry.isWin !== 'boolean') {
    return false;
  }
  return true;
}

// Handle GET request
async function handleGet(request, kv) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'all';
  
  const leaderboard = await getLeaderboard(kv);
  const filtered = filterByDateRange(leaderboard, type);
  
  // Sort by score descending
  filtered.sort((a, b) => b.score - a.score);
  
  // Return top 10
  const top10 = filtered.slice(0, 10);
  
  return jsonResponse({
    success: true,
    data: top10,
    total: filtered.length
  });
}

// Handle POST request
async function handlePost(request, kv) {
  try {
    const body = await request.json();
    
    if (!validateEntry(body)) {
      return errorResponse('Invalid entry data');
    }
    
    const leaderboard = await getLeaderboard(kv);
    
    // Check if name already exists
    const existingIndex = leaderboard.findIndex(entry => entry.name === body.name);
    
    const newEntry = {
      name: body.name,
      score: body.score,
      isWin: body.isWin,
      date: body.date || getDateString(),
      timestamp: body.timestamp || getTimestamp()
    };
    
    if (existingIndex !== -1) {
      // Only keep the highest score for same name
      if (newEntry.score > leaderboard[existingIndex].score) {
        leaderboard[existingIndex] = newEntry;
      } else {
        return jsonResponse({
          success: false,
          message: 'Score not higher than existing record'
        });
      }
    } else {
      leaderboard.push(newEntry);
    }
    
    // Sort and keep top 10
    leaderboard.sort((a, b) => b.score - a.score);
    const trimmed = leaderboard.slice(0, 10);
    
    const saved = await saveLeaderboard(kv, trimmed);
    
    if (!saved) {
      return errorResponse('Failed to save leaderboard', 500);
    }
    
    return jsonResponse({
      success: true,
      message: 'Entry added successfully',
      rank: trimmed.findIndex(e => e.name === newEntry.name) + 1
    });
  } catch (e) {
    console.error('Error handling POST:', e);
    return errorResponse('Invalid request body');
  }
}

// Handle DELETE request
async function handleDelete(request, kv) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  
  if (name) {
    // Delete specific entry
    const leaderboard = await getLeaderboard(kv);
    const filtered = leaderboard.filter(entry => entry.name !== name);
    await saveLeaderboard(kv, filtered);
    return jsonResponse({
      success: true,
      message: `Entry '${name}' deleted`
    });
  } else {
    // Clear all
    await kv.put('leaderboard', JSON.stringify([]));
    return jsonResponse({
      success: true,
      message: 'Leaderboard cleared'
    });
  }
}

// Main handler
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    const kv = env.LEADERBOARD_KV;
    
    if (!kv) {
      return errorResponse('KV namespace not configured', 500);
    }
    
    try {
      if (request.method === 'GET') {
        return await handleGet(request, kv);
      }
      
      if (request.method === 'POST') {
        return await handlePost(request, kv);
      }
      
      if (request.method === 'DELETE') {
        return await handleDelete(request, kv);
      }
      
      return errorResponse('Method not allowed', 405);
    } catch (e) {
      console.error('Worker error:', e);
      return errorResponse('Internal server error', 500);
    }
  }
};