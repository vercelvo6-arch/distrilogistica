import { NextResponse } from 'next/server';
import { resetDBConnection } from './db';

export async function handleDBError(error: any, context: string) {
  console.error(`[${context}] ERROR:`, error);
  
  // Si es error de conexión EMFILE, reiniciar
  if (error.message?.includes('EMFILE') || 
      error.message?.includes('fetch failed') ||
      error.message?.includes('Error connecting to database')) {
    
    console.error(`[${context}] ⚠️ Error de conexión detectado - Reiniciando pool`);
    resetDBConnection();
    
    return NextResponse.json(
      { 
        error: 'Error de conexión a la base de datos. Por favor, intenta de nuevo en unos segundos.',
        retry: true 
      },
      { status: 503 }
    );
  }
  
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Error desconocido' },
    { status: 500 }
  );
}
