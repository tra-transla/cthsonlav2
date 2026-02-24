export default {
  async fetch(request, env) {
    // Xử lý CORS preflight cho các request từ browser
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'apikey,Authorization,Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    const { pathname, searchParams } = new URL(request.url);
    const supabaseUrl = 'https://uhaqofhnfetdkciaswof.supabase.co';
    const supabaseKey = env.SUPABASE_SERVICE_KEY;
    
    // Ví dụ: Lấy dữ liệu từ bảng users
    const response = await fetch(`${supabaseUrl}/rest/v1/users${searchParams}`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation' // Để Supabase trả về dữ liệu
      }
    });
    
    const data = await response.text();
    
    return new Response(data, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'apikey,Authorization,Content-Type'
      }
    });
  }
};
