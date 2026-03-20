import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';

export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Check is_platform_admin flag in users table
  const { data: dbUser } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!dbUser?.is_platform_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  req.user = user;
  next();
}
