export class AppDataError extends Error {}

export function raiseIf(error: { message: string; code?: string } | null) {
  if (!error) return;
  console.error(error);
  if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message)) {
    throw new AppDataError(
      "The database schema is missing a column or table. Apply the latest file in supabase/migrations in the Supabase SQL editor, then reload.",
    );
  }
  throw new AppDataError("The workspace data could not be loaded.");
}

export function actionError(error: { message: string; code?: string } | null) {
  if (!error) return "The change could not be saved.";
  console.error(error);
  if (error.code === "PGRST202" || error.code === "42883") {
    return "A database function is missing. Apply the latest Supabase migration.";
  }
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "The database schema is not installed yet. Apply the Supabase migration.";
  }
  if (error.code === "23505") return "A matching record already exists. Open the existing record instead of creating a duplicate.";
  const message = error.message.replace(/^P0001:\s*/, "");
  if (/relation |column |syntax|permission denied|stack|function public/i.test(message)) {
    return "The change could not be saved.";
  }
  return message;
}
