/**
 * `/today` is now the home route.
 *
 * The old landing page was a menu of cards linking to the five sections — dead weight in a
 * single-user tool, where the first question is always "what do I do now" and never "where would I
 * like to go". Oggi took the root, and this route survives only so existing links and bookmarks
 * keep working.
 */
import { redirect } from "next/navigation";

const TodayRedirect = () => {
  redirect("/");
};

export default TodayRedirect;
