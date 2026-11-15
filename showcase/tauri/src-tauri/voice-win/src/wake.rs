// The wake phrase, "Alright Jarvis": a greeting, then the name, at the start of something said (the text's start or
// after a sentence end). The twin of WakeWord in voice/main.swift, where the greeting is "Hey", for what Parakeet
// writes: "Alright, Jarvis.", "All right Jarvis", "Alright, Jarvis's". The name can be the user's own.
// The name by itself wakes it too, but only as the first thing said ("Jarvis, what's the time?", or after one
// other word: "Hey Jarvis"); in the middle of a sentence it never does. Nothing here keeps or logs what was heard.

pub const DEFAULT_NAME: &str = "jarvis";

/// "Alright", as one word, in the spellings a recogniser writes. "All right" as two words counts too (greeting_len).
const GREETINGS: [&str; 5] = ["alright", "allright", "alrighty", "aright", "alrite"];

pub struct WakeWord {
    name: String,
}

/// The phrase was said: what came after it ("" if nothing yet), and how many words of the text it took (with any
/// stray ones before it), so a later reading of the same take can drop them even if it no longer matches.
#[derive(Debug, PartialEq)]
pub struct Hit {
    pub rest: String,
    pub words: usize,
}

struct Tok {
    word: String,
    start: usize,
    end: usize,
}

/// Lowercased words without apostrophes ("Jarvis's" -> "jarviss"), with where each sits in the text (bytes).
fn tokens(text: &str) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    let close = |s: usize, e: usize, out: &mut Vec<Tok>| {
        let word: String = text[s..e].chars().filter(|c| *c != '\'' && *c != '\u{2019}').flat_map(char::to_lowercase).collect();
        if !word.is_empty() {
            out.push(Tok { word, start: s, end: e });
        }
    };
    for (i, c) in text.char_indices() {
        let in_word = c.is_alphanumeric() || ((c == '\'' || c == '\u{2019}') && start.is_some());
        if in_word {
            start.get_or_insert(i);
        } else if let Some(s) = start.take() {
            close(s, i, &mut out);
        }
    }
    if let Some(s) = start {
        close(s, text.len(), &mut out);
    }
    out
}

/// How many letters must change to turn one word into the other.
fn edits(a: &str, b: &str) -> usize {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    if a.is_empty() || b.is_empty() {
        return a.len().max(b.len());
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = prev.clone();
    for i in 1..=a.len() {
        cur[0] = i;
        for j in 1..=b.len() {
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + usize::from(a[i - 1] != b[j - 1]));
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

/// How many words the greeting takes at word i: 1 ("alright"), 2 ("all right") or 0 when there's none.
fn greeting_len(words: &[Tok], i: usize) -> usize {
    if GREETINGS.contains(&words[i].word.as_str()) {
        1
    } else if words[i].word == "all" && words.get(i + 1).is_some_and(|w| w.word == "right") {
        2
    } else {
        0
    }
}

/// What follows the first n words of the text.
pub fn dropping(n: usize, text: &str) -> String {
    let words = tokens(text);
    if n == 0 {
        return text.trim().to_string();
    }
    match words.get(n) {
        Some(w) => text[w.start..].trim().to_string(),
        None => String::new(),
    }
}

impl WakeWord {
    pub fn new() -> WakeWord {
        WakeWord { name: DEFAULT_NAME.to_string() }
    }

    /// Sets the name after the greeting; "" goes back to Jarvis. Letters only, 4 to 20 of them; anything else is
    /// refused (false) and the name stays as it was.
    pub fn set_name(&mut self, raw: &str) -> bool {
        let w: String = raw.chars().filter(|c| c.is_alphabetic()).flat_map(char::to_lowercase).collect();
        if w.is_empty() {
            self.name = DEFAULT_NAME.to_string();
            return true;
        }
        if !(4..=20).contains(&w.chars().count()) {
            return false;
        }
        self.name = w;
        true
    }

    /// Edits allowed in the name as heard. A short name must be heard exactly ("Nova" mustn't take "Nora"); 6 or 7
    /// letters allow one edit ("Jarvis's", "Jervis"), longer ones two.
    fn allowed_edits(&self) -> usize {
        match self.name.chars().count() {
            n if n >= 8 => 2,
            n if n >= 6 => 1,
            _ => 0,
        }
    }

    /// Whether a heard word (within the allowed edits) is shaped like the name: the same first letter, about as long.
    fn plausible(&self, heard: &str) -> bool {
        heard.chars().next() == self.name.chars().next() && heard.chars().count() + 1 >= self.name.chars().count()
    }

    /// Whether a heard word is the name. A name of the user's own: within the allowed edits, with the same first
    /// letter and about as long. Jarvis, the default, is heard in many ways ("Javis", "Javas", "Jarvas", "Jervis",
    /// "Charvis", "Yarvis"), so it gets its own, wider rule: it starts with a J sound, has the V in it, is 4 to 8
    /// letters and within two edits. "Travis", "Davis", "Java" and "service" stay out.
    fn is_name(&self, heard: &str, joined: bool) -> bool {
        if self.name != DEFAULT_NAME {
            let allowed = self.allowed_edits() as isize - isize::from(joined);
            return (edits(heard, &self.name) as isize) <= allowed && self.plausible(heard);
        }
        let j = ["ch", "dj", "dsch", "g", "y"].iter().find_map(|p| heard.strip_prefix(p).map(|rest| format!("j{rest}"))).unwrap_or_else(|| heard.to_string());
        let len = j.chars().count();
        j.starts_with('j') && (4..=8).contains(&len) && j.contains(['v', 'f', 'w', 'b']) && edits(&j, DEFAULT_NAME) <= if joined || len < 5 { 1 } else { 2 }
    }

    /// The name as heard at word i: as one word, or split in two ("Jar vis"), which must then be a closer match.
    /// Returns the index of its last word.
    fn name_at(&self, words: &[Tok], i: usize) -> Option<usize> {
        if self.is_name(&words[i].word, false) {
            return Some(i);
        }
        let next = words.get(i + 1)?;
        self.is_name(&format!("{}{}", words[i].word, next.word), true).then_some(i + 1)
    }

    fn hit(text: &str, words: &[Tok], last: usize) -> Hit {
        let rest = text[words[last].end..].trim_start_matches(|c: char| !c.is_alphanumeric()).trim().to_string();
        Hit { rest, words: last + 1 }
    }

    /// The phrase in what was heard, or None when it isn't there.
    pub fn scan(&self, text: &str) -> Option<Hit> {
        let words = tokens(text);
        // The name by itself, as the first thing said or after one other word ("Jarvis, ...", "Hey Jarvis, ...").
        for i in 0..words.len().min(2) {
            if let Some(last) = self.name_at(&words, i) {
                return Some(Self::hit(text, &words, last));
            }
        }
        for i in 0..words.len() {
            let g = greeting_len(&words, i);
            let name_at = i + g;
            if g == 0 || name_at >= words.len() {
                continue;
            }
            // Up to two stray words may come first ("um", "okay", a cough heard as "the"); after that, only at the
            // start of a sentence.
            let before = &text[if i == 0 { 0 } else { words[i - 1].end }..words[i].start];
            let at_start = i <= 2 || before.contains(['.', '?', '!']);
            // Only spaces or light punctuation between greeting and name ("Alright, Jarvis", "All right. Jarvis").
            let gap = &text[words[name_at - 1].end..words[name_at].start];
            if !at_start || !gap.chars().all(|c| matches!(c, ' ' | ',' | '.' | '!')) {
                continue;
            }
            if let Some(last) = self.name_at(&words, name_at) {
                return Some(Self::hit(text, &words, last));
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rest(text: &str) -> Option<String> {
        WakeWord::new().scan(text).map(|h| h.rest)
    }

    #[test]
    fn the_phrase_wakes_it_as_parakeet_writes_it() {
        assert_eq!(rest("Alright Jarvis"), Some(String::new()));
        assert_eq!(rest("Alright, Jarvis."), Some(String::new()));
        assert_eq!(rest("alright jarvis what's the weather"), Some("what's the weather".into()));
        assert_eq!(rest("Alright, Jarvis, what's the weather?"), Some("what's the weather?".into()));
        assert_eq!(rest("All right, Jarvis. Open my browser."), Some("Open my browser.".into()));
        assert_eq!(rest("All right. Jarvis, open my browser."), Some("open my browser.".into()));
        assert_eq!(rest("Um, alright Jarvis, hello"), Some("hello".into()), "a stray word first");
        assert_eq!(rest("That works. Alright, Jarvis, next one."), Some("next one.".into()), "after a sentence end");
    }

    #[test]
    fn near_misses_of_the_name_count() {
        assert_eq!(rest("Alright Jervis, play music"), Some("play music".into()));
        assert_eq!(rest("Alright Jarvis's, play music"), Some("play music".into()));
        assert_eq!(rest("Alright jar vis play music"), Some("play music".into()), "split in two");
    }

    #[test]
    fn the_name_alone_wakes_it_as_the_first_thing_said() {
        assert_eq!(rest("Jarvis"), Some(String::new()));
        assert_eq!(rest("Jarvis, what time is it?"), Some("what time is it?".into()));
        assert_eq!(rest("Hey Jarvis, what time is it"), Some("what time is it".into()), "after one other word");
        assert_eq!(rest("Jar vis, play music"), Some("play music".into()));
        assert_eq!(WakeWord::new().scan("Jarvis, go on").map(|h| h.words), Some(1));
        assert_eq!(WakeWord::new().scan("Okay Jarvis go on").map(|h| h.words), Some(2));
        assert_eq!(rest("So yesterday Jarvis told me a joke"), None, "not in the middle of a sentence");
        assert_eq!(rest("Travis, what time is it"), None, "another name");
    }

    #[test]
    fn jarvis_is_heard_in_many_ways() {
        for heard in ["Javis", "Javas", "Jarvas", "Jarves", "Jarvus", "Jervis", "Jarviz", "Charvis", "Yarvis", "Jarvis's", "Jarfis", "Jarbis"] {
            assert_eq!(rest(&format!("{heard}, what time is it")), Some("what time is it".into()), "{heard} alone");
            assert_eq!(rest(&format!("Alright {heard}, what time is it")), Some("what time is it".into()), "alright {heard}");
        }
        for other in ["Travis", "Davis", "Java", "Jarring", "Service", "Jealous", "Chavez", "Jar", "Jobs", "Harvest", "Nervous"] {
            assert_eq!(rest(&format!("{other}, what time is it")), None, "{other} is not the name");
        }
    }

    #[test]
    fn other_talk_does_not_wake_it() {
        assert_eq!(rest(""), None);
        assert_eq!(rest("Alright"), None, "the greeting alone");
        assert_eq!(rest("Alright Travis, let's go"), None, "another name");
        assert_eq!(rest("Alright then, Jarvis can wait"), None, "words between greeting and name");
        assert_eq!(rest("I think Jarvis is alright"), None);
        assert_eq!(rest("we talked for a while and then he said alright Jarvis"), None, "late in a sentence");
        assert_eq!(rest("All right, that's all right"), None);
    }

    #[test]
    fn the_name_can_be_the_users_own() {
        let mut w = WakeWord::new();
        assert!(w.set_name("Friday"));
        assert_eq!(w.scan("Alright Friday, hi").map(|h| h.rest), Some("hi".into()));
        assert_eq!(w.scan("Alright Jarvis, hi"), None);
        assert!(!w.set_name("Bob"), "under 4 letters is refused");
        assert_eq!(w.scan("Alright Friday").map(|h| h.words), Some(2), "and the name stays");
        assert!(w.set_name(""));
        assert_eq!(w.scan("Alright Jarvis").map(|h| h.words), Some(2), "empty: back to Jarvis");
        assert!(w.set_name("Nova"));
        assert_eq!(w.scan("Alright Nora"), None, "a short name must be heard exactly");
    }

    #[test]
    fn a_later_reading_drops_the_phrase_by_its_words() {
        assert_eq!(WakeWord::new().scan("Um, all right Jarvis, go on").map(|h| h.words), Some(4));
        assert_eq!(dropping(4, "Um, all right Jarvis, go on"), "go on");
        assert_eq!(dropping(3, "All right Jarvis"), "");
        assert_eq!(dropping(2, "Alright Jar this, go on"), "this, go on");
        assert_eq!(dropping(0, " hello "), "hello");
    }
}
