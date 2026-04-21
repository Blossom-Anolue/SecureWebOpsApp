import React, { useState, useEffect } from 'react';
import { GraduationCap, PlayCircle, CheckCircle2, Clock, X, ChevronRight, ChevronLeft, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type LessonStep = {
  title: string;
  content: React.ReactNode;
};

type Quiz = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type InteractiveLesson = {
  id: string;
  title: string;
  description: string;
  duration: string;
  category: string;
  steps: LessonStep[];
  quiz: Quiz[];
};

const interactiveLessons: InteractiveLesson[] = [
  {
    id: 'spotting-phishing-1',
    title: 'Spotting Phishing Emails (Part 1)',
    description: 'Learn the basics of phishing and common red flags.',
    duration: '3 min',
    category: 'Email Security',
    steps: [
      {
        title: "What is Phishing?",
        content: <p>Phishing is a cyber attack that uses disguised email as a weapon. The goal is to trick the email recipient into believing that the message is something they want or need — a request from their bank, for instance, or a note from someone in their company — and to click a link or download an attachment.</p>
      },
      {
        title: "Red Flags to Watch For",
        content: (
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Urgent or threatening language:</strong> "Your account will be suspended in 24 hours."</li>
            <li><strong>Suspicious sender address:</strong> Looks like a real address but has a slight typo (e.g., support@paypa1.com).</li>
            <li><strong>Generic greetings:</strong> "Dear Customer" instead of your actual name.</li>
            <li><strong>Unexpected attachments or weird links:</strong> Always hover over links before clicking.</li>
          </ul>
        )
      },
    ],
    quiz: [
      {
        question: "Which of the following is a common red flag of a phishing email?",
        options: [
          "The email addresses you by your full, correct name.",
          "The sender's email address has a slight typo compared to the official domain.",
          "The email includes a signature from an employee you know.",
          "The email does not contain any links or attachments."
        ],
        correctIndex: 1,
        explanation: "Phishers often use look-alike domains like @rnicrosoft.com instead of @microsoft.com to appear legitimate."
      },
      {
        question: "What should you do first if an email pressures you to verify your account immediately?",
        options: [
          "Click the link quickly before the deadline expires.",
          "Reply to the sender asking if the email is real.",
          "Verify the request using a trusted channel or by visiting the official site directly.",
          "Forward the email to coworkers to see what they think."
        ],
        correctIndex: 2,
        explanation: "Using a trusted channel or typing the known website directly avoids interacting with a potentially malicious link."
      },
      {
        question: "Which greeting is more suspicious in a message claiming to be from your payroll team?",
        options: [
          "Hello Melinda,",
          "Dear Employee,",
          "Hi team,",
          "Good morning,"
        ],
        correctIndex: 1,
        explanation: "Generic greetings are often used in phishing because the attacker does not know the recipient personally."
      },
      {
        question: "Why should you hover over links before clicking them?",
        options: [
          "It improves email loading speed.",
          "It reveals the real destination URL.",
          "It confirms the sender has MFA enabled.",
          "It automatically scans the link for malware."
        ],
        correctIndex: 1,
        explanation: "Hovering helps you compare the displayed text with the actual destination before opening the link."
      },
      {
        question: "Which request should immediately raise concern in an unexpected email?",
        options: [
          "A request to review a meeting agenda you were expecting.",
          "A request for your MFA code to complete a login.",
          "A reminder about a scheduled team call.",
          "A note from HR about an announced benefits enrollment window."
        ],
        correctIndex: 1,
        explanation: "Legitimate teams should never ask for your MFA code by email."
      },
    ]
  },
  {
    id: 'spotting-phishing-2',
    title: 'Spotting Phishing Emails (Part 2)',
    description: 'Learn what to do before clicking and how to respond safely.',
    duration: '3 min',
    category: 'Email Security',
    steps: [
      {
        title: "Before You Click",
        content: (
          <ul className="list-disc pl-5 space-y-2">
            <li>Pause and verify the request through a trusted channel like Teams, Slack, or a phone call.</li>
            <li>Hover over links to inspect the real destination before opening them.</li>
            <li>Be cautious with messages asking for passwords, MFA codes, wire transfers, or gift cards.</li>
            <li>When in doubt, report the message instead of replying to it.</li>
          </ul>
        )
      }
    ],
    quiz: [
      {
        question: "What is a look-alike domain?",
        options: [
          "A domain that uses the same hosting provider as a trusted company.",
          "A domain that visually imitates a legitimate one to fool users.",
          "A domain with a valid SSL certificate.",
          "A domain that belongs to a company subsidiary."
        ],
        correctIndex: 1,
        explanation: "Look-alike domains use similar spelling or characters to trick people into trusting them."
      },
      {
        question: "What is the safest way to access your bank or payroll portal after receiving a suspicious alert email?",
        options: [
          "Use the link inside the email once you read it carefully.",
          "Reply to the message and ask if it is safe.",
          "Open the site from your saved bookmark or type the known URL directly.",
          "Forward the email to coworkers and ask them to test it."
        ],
        correctIndex: 2,
        explanation: "Using a known-good bookmark or manually typed URL avoids the email's potentially malicious link entirely."
      },
      {
        question: "Which file type in an unexpected email should be treated carefully?",
        options: [
          "A macro-enabled Office document",
          "A plain text file from your teammate",
          "A screenshot you requested",
          "A PDF handbook from an announced policy update"
        ],
        correctIndex: 0,
        explanation: "Macro-enabled documents are frequently used to deliver malware or launch credential theft attacks."
      },
      {
        question: "Why do phishing emails often create a sense of urgency?",
        options: [
          "To help email filters categorize them faster",
          "To pressure you into acting before you think critically",
          "To make the message look more professional",
          "To reduce attachment size"
        ],
        correctIndex: 1,
        explanation: "Urgency is a social engineering tactic that pushes victims to react quickly instead of verifying the request."
      },
      {
        question: "Which is the best response to a suspicious email from a known coworker?",
        options: [
          "Assume it is safe because you know the sender",
          "Click the link because internal accounts cannot be compromised",
          "Verify the request using a separate trusted channel",
          "Mark it safe so future emails from that person bypass filtering"
        ],
        correctIndex: 2,
        explanation: "Known accounts can still be compromised, so a separate verification step is the safest response."
      },
      {
        question: "What should you do if you are unsure whether an email is phishing?",
        options: [
          "Delete it and keep quiet",
          "Report it through the approved security channel",
          "Reply and ask the sender to confirm their identity",
          "Open the attachment in a normal desktop app first"
        ],
        correctIndex: 1,
        explanation: "Reporting suspicious messages helps the security team investigate and protect others without increasing risk."
      }
    ]
  },
  {
    id: 'secure-file-vault-1',
    title: 'Using the Secure Vault (Part 1)',
    description: 'Understand the basics of encryption and how our vault works.',
    duration: '2 min',
    category: 'Data Protection',
    steps: [
      {
        title: "Why Encrypt?",
        content: <p>When you upload sensitive files like financial reports or personal data, storing them in plaintext is risky. If the database is compromised, the files are easily readable. Encryption turns your files into unreadable ciphertext.</p>
      },
      {
        title: "How Our Vault Works",
        content: (
          <ul className="list-disc pl-5 space-y-2">
            <li>We use <strong>AES-256-GCM</strong>, an industry-standard encryption algorithm.</li>
            <li>Files are encrypted <em>before</em> they are stored in the cloud bucket.</li>
            <li>To decrypt, the original master key must be used. Access is tightly controlled and logged.</li>
          </ul>
        )
      },
    ],
    quiz: [
      {
        question: "What is the primary benefit of AES-256-GCM encryption for your PDFs?",
        options: [
          "It makes the PDF files load faster on mobile devices.",
          "It compresses the file size to save storage space.",
          "It ensures data confidentiality and authenticity before cloud storage.",
          "It automatically translates the document into multiple languages."
        ],
        correctIndex: 2,
        explanation: "AES-256-GCM provides confidentiality and integrity, so the file stays unreadable to unauthorized users and tampering can be detected."
      },
      {
        question: "Which behavior best supports secure vault usage?",
        options: [
          "Keeping broad access permissions in place to reduce admin work.",
          "Downloading decrypted copies to personal devices for convenience.",
          "Reviewing access regularly and limiting decryption to real business needs.",
          "Sharing one account among multiple teammates."
        ],
        correctIndex: 2,
        explanation: "Strong vault hygiene means least-privilege access, fewer decrypted copies, and clear accountability."
      },
      {
        question: "What does encryption primarily do to a file before storage?",
        options: [
          "Renames the file for easier indexing",
          "Turns the contents into unreadable ciphertext",
          "Removes all metadata permanently",
          "Makes the file impossible to share"
        ],
        correctIndex: 1,
        explanation: "Encryption transforms readable data into ciphertext so unauthorized users cannot understand it."
      },
      {
        question: "Why is storing sensitive PDFs in plaintext risky?",
        options: [
          "Plaintext files are larger than encrypted ones",
          "Plaintext files can be immediately read if storage is compromised",
          "Plaintext files cannot be backed up",
          "Plaintext files are incompatible with cloud storage"
        ],
        correctIndex: 1,
        explanation: "If an attacker reaches plaintext files, the information is exposed instantly without any decryption barrier."
      },
      {
        question: "What security property does the GCM mode provide in addition to confidentiality?",
        options: [
          "Automatic file compression",
          "Automatic password rotation",
          "Integrity/authenticity checking",
          "User account provisioning"
        ],
        correctIndex: 2,
        explanation: "GCM helps detect tampering, which protects the integrity and authenticity of the encrypted data."
      },
    ]
  },
  {
    id: 'secure-file-vault-2',
    title: 'Using the Secure Vault (Part 2)',
    description: 'Learn about vault hygiene and best practices.',
    duration: '2 min',
    category: 'Data Protection',
    steps: [
      {
        title: "What Good Vault Hygiene Looks Like",
        content: (
          <ul className="list-disc pl-5 space-y-2">
            <li>Upload only the files that truly need secure retention.</li>
            <li>Name documents clearly so teammates can identify them without opening sensitive content unnecessarily.</li>
            <li>Review who has access on a regular basis and remove stale permissions quickly.</li>
            <li>Download and decrypt only when there is a clear business need.</li>
          </ul>
        )
      }
    ],
    quiz: [
      {
        question: "Which action best follows least-privilege principles in the vault?",
        options: [
          "Giving every teammate admin access by default",
          "Granting only the smallest permission needed for the task",
          "Sharing a single team account for easier access",
          "Keeping old access grants forever in case they are needed again"
        ],
        correctIndex: 1,
        explanation: "Least privilege reduces risk by limiting what each user can do."
      },
      {
        question: "Why should decrypted copies be kept to a minimum?",
        options: [
          "They improve encryption strength if fewer exist",
          "They increase the amount of exposed readable data in circulation",
          "They prevent audit logs from working",
          "They stop file sharing features from working"
        ],
        correctIndex: 1,
        explanation: "Every decrypted copy creates another exposure point that must be protected."
      },
      {
        question: "What is a good reason to review vault access regularly?",
        options: [
          "To make files load more quickly",
          "To remove stale permissions that no longer reflect business need",
          "To reduce PDF file size",
          "To change all document titles every month"
        ],
        correctIndex: 1,
        explanation: "Regular reviews help ensure only the right people retain access over time."
      },
      {
        question: "What is the safest place for sensitive documents that need controlled access?",
        options: [
          "A personal email inbox",
          "A public shared drive",
          "A secured encrypted vault with access controls",
          "A local desktop downloads folder"
        ],
        correctIndex: 2,
        explanation: "An encrypted vault combines storage protection with access controls and auditing."
      },
      {
        question: "Why is clear file naming useful in a secure vault?",
        options: [
          "It eliminates the need for encryption",
          "It reduces unnecessary opening of sensitive files to identify them",
          "It automatically grants permission to the right users",
          "It hides the existence of the document"
        ],
        correctIndex: 1,
        explanation: "Clear names help users locate the correct file without repeatedly decrypting or opening documents unnecessarily."
      },
      {
        question: "What should happen when a user no longer needs access to a protected PDF?",
        options: [
          "Their access should stay in place in case they return later",
          "Their access should be removed promptly",
          "The file should be moved to public storage",
          "The file should be decrypted permanently"
        ],
        correctIndex: 1,
        explanation: "Promptly removing unnecessary access keeps permissions aligned with current business needs."
      }
    ]
  },
  {
    id: 'safe-sharing-1',
    title: 'Safe File Sharing (Part 1)',
    description: 'Learn about least privilege and secure sharing via email.',
    duration: '3 min',
    category: 'Access Control',
    steps: [
      {
        title: "The Principle of Least Privilege",
        content: <p>When granting access to secure files, always follow the principle of least privilege: give users only the access they absolutely need to do their jobs, and nothing more.</p>
      },
      {
        title: "Sharing by Verified Email",
        content: <p>Instead of sending unencrypted attachments via email, SecureWebOps allows sharing access directly via a verified email address. The system automatically resolves this to a secure user identity, making it user-friendly while maintaining a hard cryptographic link in the database.</p>
      },
    ],
    quiz: [
      {
        question: "What is the Principle of Least Privilege?",
        options: [
          "Giving everyone admin access to save time on requests.",
          "Giving users only the minimum access necessary to perform their tasks.",
          "Denying all access requests by default.",
          "Only granting access to users who have been with the company for over a year."
        ],
        correctIndex: 1,
        explanation: "Least privilege minimizes the blast radius of a compromised account by limiting what that account can reach."
      },
      {
        question: "Which sharing action is safest for a sensitive encrypted document?",
        options: [
          "Granting permanent admin access because the project might grow later.",
          "Sharing by verified email address with the smallest permission level needed.",
          "Sending a decrypted copy over personal email for speed.",
          "Posting the link in a shared group chat."
        ],
        correctIndex: 1,
        explanation: "Sharing by verified email address with limited permissions protects the document while still enabling the task."
      },
      {
        question: "Why is sharing access via a verified email address safer than sending files around casually?",
        options: [
          "It avoids any need for audit logs",
          "It reduces accountability",
          "It ties access to a specific known identity in the system without sending an attachment",
          "It makes files public only to trusted users"
        ],
        correctIndex: 2,
        explanation: "Sharing by verified email address improves traceability and reduces the chance of exposing files to the wrong recipient."
      },
      {
        question: "What permission level should you grant when someone only needs to read a document?",
        options: [
          "The minimum read-only or view-level access available",
          "Admin access so they do not need to ask again",
          "Full delete access for flexibility",
          "No access review at all"
        ],
        correctIndex: 0,
        explanation: "Users should receive only the minimum access required for the job they are doing."
      },
      {
        question: "When is it appropriate to grant elevated admin access?",
        options: [
          "Whenever a teammate asks nicely",
          "For clearly defined tasks with a real business need",
          "For every new employee by default",
          "Only after the file has been decrypted"
        ],
        correctIndex: 1,
        explanation: "Elevated access should be limited to situations where it is genuinely necessary."
      },
    ]
  },
  {
    id: 'safe-sharing-2',
    title: 'Safe File Sharing (Part 2)',
    description: 'Understand the importance of access reviews and temporary access.',
    duration: '3 min',
    category: 'Access Control',
    steps: [
      {
        title: "Access Reviews Matter",
        content: (
          <ul className="list-disc pl-5 space-y-2">
            <li>Remove access for contractors and former employees as soon as their work ends.</li>
            <li>Grant temporary elevated access only for clearly defined tasks.</li>
            <li>Document why access was granted so reviews are easier later.</li>
          </ul>
        )
      }
    ],
    quiz: [
      {
        question: "Why should temporary access be removed after the task is done?",
        options: [
          "It makes the file smaller",
          "It reduces the window of unnecessary exposure",
          "It improves internet speed",
          "It changes the encryption algorithm"
        ],
        correctIndex: 1,
        explanation: "Temporary access should expire or be removed quickly so it does not become long-term risk."
      },
      {
        question: "Which action weakens secure sharing practices?",
        options: [
          "Documenting why access was granted",
          "Reviewing permissions regularly",
          "Sending a decrypted copy over an unapproved channel",
          "Using the smallest appropriate permission level"
        ],
        correctIndex: 2,
        explanation: "Unapproved sharing channels reduce control, visibility, and security."
      },
      {
        question: "Why are access reviews important after employees leave or change roles?",
        options: [
          "They help preserve outdated permissions",
          "They ensure old access does not remain active unnecessarily",
          "They automatically re-encrypt files",
          "They replace the need for authentication"
        ],
        correctIndex: 1,
        explanation: "Role changes and departures are common moments where unnecessary access can linger if not reviewed."
      },
      {
        question: "What is the safest way to handle a request for urgent file access?",
        options: [
          "Grant admin immediately and ask questions later",
          "Verify the need and assign only the required level of access",
          "Send a decrypted file over chat for speed",
          "Share your own account credentials temporarily"
        ],
        correctIndex: 1,
        explanation: "Urgency should not bypass verification and least-privilege controls."
      },
      {
        question: "Which statement best describes strong access control?",
        options: [
          "Everyone can reach everything to reduce friction",
          "Access is granted based on verified identity and business need",
          "Access decisions are made informally in chat",
          "Permissions are rarely changed once assigned"
        ],
        correctIndex: 1,
        explanation: "Strong access control depends on verified identity, clear business need, and ongoing review."
      },
      {
        question: "What should happen to contractor access when the project ends?",
        options: [
          "It should remain in case future work appears",
          "It should be upgraded to admin for archival purposes",
          "It should be removed promptly",
          "It should be transferred automatically to all team members"
        ],
        correctIndex: 2,
        explanation: "Contractor access should end when the work ends so unnecessary exposure does not continue."
      }
    ]
  },
  {
    id: 'website-scans-1',
    title: 'Understanding Website Scans (Part 1)',
    description: 'Learn the basics of vulnerability scanning and the OWASP Top 10.',
    duration: '3 min',
    category: 'Web Security',
    steps: [
      {
        title: "What is a Vulnerability Scan?",
        content: <p>A vulnerability scan is an automated process that inspects your website for security weaknesses. Think of it like a digital security guard walking around your building, checking to see if any doors are unlocked or windows are left open before a burglar can find them.</p>
      },
      {
        title: "The OWASP Top 10",
        content: (
          <ul className="list-disc pl-5 space-y-2">
            <li>The <strong>OWASP Top 10</strong> is an industry-standard awareness document for developers and web application security.</li>
            <li>It represents a broad consensus about the most critical security risks to web applications (such as broken authentication or cryptographic failures).</li>
            <li>SecureWebOps maps its findings directly to these categories to help you understand the specific nature of a threat.</li>
          </ul>
        )
      },
    ],
    quiz: [
      {
        question: "What is the primary purpose of a website vulnerability scan?",
        options: [
          "To increase the website's loading speed.",
          "To find and report security weaknesses before attackers can exploit them.",
          "To block incoming malware and viruses.",
          "To automatically update the website's code to the latest version."
        ],
        correctIndex: 1,
        explanation: "Scanners identify vulnerabilities so you can fix them proactively. They do not block attacks (like a firewall) or update code automatically."
      },
      {
        question: "What is the OWASP Top 10?",
        options: [
          "A list of the top 10 most secure websites in the world.",
          "A ranking of the most critical web application security risks.",
          "A set of 10 passwords you should never use.",
          "A premium antivirus software package."
        ],
        correctIndex: 1,
        explanation: "The OWASP Top 10 is a globally recognized document outlining the most critical security risks to web applications."
      },
      {
        question: "Is running a vulnerability scan a one-time task?",
        options: [
          "Yes, once it is secure, it stays secure forever.",
          "No, new vulnerabilities are discovered daily, so scanning should be continuous or regular.",
          "Yes, unless you change your domain name.",
          "Yes, but only if you get a score of 100."
        ],
        correctIndex: 1,
        explanation: "Security is an ongoing process. Updates to your site, or the discovery of new exploit methods, require regular re-scanning."
      },
      {
        question: "Which of the following issues is a vulnerability scanner likely to find?",
        options: [
          "An employee writing their password on a sticky note.",
          "Missing HTTP security headers on your web server.",
          "A physical break-in at your office.",
          "A phishing email in your inbox."
        ],
        correctIndex: 1,
        explanation: "Web vulnerability scanners inspect the code, configurations, and headers of your website—not physical security or personal inboxes."
      }
    ]
  },
  {
    id: 'website-scans-2',
    title: 'Understanding Website Scans (Part 2)',
    description: 'Learn how to read scan results and take action to secure your site.',
    duration: '3 min',
    category: 'Web Security',
    steps: [
      {
        title: "Reading the Results",
        content: <p>Scan results are graded by severity. <strong>Critical</strong> and <strong>High</strong> severity issues indicate glaring holes that could lead to an immediate data breach or site takeover. <strong>Medium</strong> and <strong>Low</strong> issues are weaknesses that weaken your defense or could be chained together by a clever attacker.</p>
      },
      {
        title: "Taking Action",
        content: (
          <ul className="list-disc pl-5 space-y-2">
            <li>Always prioritize fixing Critical and High severity issues immediately.</li>
            <li>Review the "Recommendations" provided in the scan report and apply the fixes to your server or code.</li>
            <li>After applying a fix, <strong>always run a new scan</strong> to verify the issue is actually resolved!</li>
          </ul>
        )
      }
    ],
    quiz: [
      {
        question: "How should you prioritize fixing vulnerabilities found in a scan report?",
        options: [
          "Fix the easiest ones first to get them out of the way.",
          "Fix the Low severity ones first to build momentum.",
          "Address Critical and High severity issues immediately.",
          "Wait until the end of the year to fix them all at once."
        ],
        correctIndex: 2,
        explanation: "Critical and High severity issues pose the most immediate risk to your business and should be mitigated as soon as possible."
      },
      {
        question: "What should you do immediately after applying a fix for a vulnerability?",
        options: [
          "Assume it is fixed and forget about it.",
          "Run another security scan to verify the fix was successful.",
          "Delete the old scan report.",
          "Change your account password."
        ],
        correctIndex: 1,
        explanation: "Always verify your remediations by running a fresh scan. Sometimes a fix doesn't cover all affected areas of the application."
      },
      {
        question: "If a scanner reports a 'False Positive', what does that mean?",
        options: [
          "The scanner missed a real vulnerability.",
          "The scanner flagged something as a vulnerability, but it actually is not a threat.",
          "The website is perfectly secure.",
          "The scanner crashed during the test."
        ],
        correctIndex: 1,
        explanation: "Scanners rely on automated patterns and sometimes misinterpret safe configurations as threats. These are called false positives."
      },
      {
        question: "Why might a 'Low' severity issue still be worth fixing eventually?",
        options: [
          "It will eventually upgrade itself to Critical automatically.",
          "Attackers can sometimes chain multiple low-severity issues together to execute a larger attack.",
          "It makes the website load slower.",
          "It costs more money to leave it unfixed."
        ],
        correctIndex: 1,
        explanation: "In modern attacks, hackers often combine several minor weaknesses (like information disclosure) to achieve a major compromise."
      }
    ]
  }
];

export default function Training() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [isLoadingProgress, setIsLoadingProgress] = useState(true);

  // Lesson Execution State
  const [activeLesson, setActiveLesson] = useState<InteractiveLesson | null>(null);
  const [lessonStep, setLessonStep] = useState<number>(0);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [savedProgress, setSavedProgress] = useState<Record<string, { step: number, answers: number[] }>>({});

  // Fetch progress on load
  useEffect(() => {
    if (user?.user_metadata?.completed_lessons) {
      setCompletedLessons(user.user_metadata.completed_lessons);
    }
    if (user?.id) {
      try {
        const raw = localStorage.getItem(`securewebops_training_progress_${user.id}`);
        if (raw) setSavedProgress(JSON.parse(raw));
      } catch (e) {}
    }
    setIsLoadingProgress(false);
  }, [user]);

  const completionRate = interactiveLessons.length 
    ? (completedLessons.length / interactiveLessons.length) * 100 
    : 0;

  const openLesson = (lesson: InteractiveLesson) => {
    setActiveLesson(lesson);
    if (savedProgress[lesson.id]) {
      setLessonStep(savedProgress[lesson.id].step);
      setQuizAnswers(savedProgress[lesson.id].answers);
    } else {
      setLessonStep(0);
      setQuizAnswers(Array(lesson.quiz.length).fill(-1));
    }
    setShowQuizResult(false);
  };

  const handleSaveAndClose = () => {
    if (!activeLesson || !user) return;
    const nextProgress = {
      ...savedProgress,
      [activeLesson.id]: { step: lessonStep, answers: quizAnswers }
    };
    setSavedProgress(nextProgress);
    localStorage.setItem(`securewebops_training_progress_${user.id}`, JSON.stringify(nextProgress));
    closeLesson();
    toast({ title: "Progress Saved", description: "You can resume this lesson later." });
  };

  const closeLesson = () => {
    setActiveLesson(null);
    setLessonStep(0);
    setQuizAnswers([]);
    setShowQuizResult(false);
  };

  const handleNextStep = () => {
    if (activeLesson && lessonStep < activeLesson.steps.length) {
      setLessonStep(prev => prev + 1);
    }
  };

  const handlePrevStep = () => {
    if (lessonStep > 0) {
      setLessonStep(prev => prev - 1);
    }
  };

  const quizScore = activeLesson
    ? activeLesson.quiz.reduce((total, question, index) => {
        return total + (quizAnswers[index] === question.correctIndex ? 1 : 0);
      }, 0)
    : 0;

  const submitQuiz = async () => {
    if (!activeLesson || quizAnswers.some((answer) => answer === -1)) return;
    
    setShowQuizResult(true);
    
    const passed = activeLesson.quiz.every((question, index) => quizAnswers[index] === question.correctIndex);

    if (passed) {
      const newCompleted = Array.from(new Set([...completedLessons, activeLesson.id]));
      setCompletedLessons(newCompleted);
      
      // Persist to user metadata
      if (user) {
        const nextProgress = { ...savedProgress };
        delete nextProgress[activeLesson.id];
        setSavedProgress(nextProgress);
        localStorage.setItem(`securewebops_training_progress_${user.id}`, JSON.stringify(nextProgress));

        await supabase.auth.updateUser({
          data: { completed_lessons: newCompleted }
        });
      }
      
      toast({
        title: "Lesson Completed! 🎉",
        description: `You have successfully completed "${activeLesson.title}".`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto bg-green-50 text-green-900 border-green-200',
      });
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Enhanced Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent p-6 md:p-8 border border-emerald-500/10">
        <div className="absolute -right-6 -top-6 opacity-10 pointer-events-none">
          <GraduationCap className="w-32 h-32 text-emerald-600" />
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl lg:text-4xl font-bold font-display text-slate-900 dark:text-white">Security Training</h1>
          <p className="text-muted-foreground mt-2 text-lg max-w-2xl">
            Learn to protect your business and test your team with interactive lessons.
          </p>
        </div>
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Your Training Progress</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {completedLessons.length} of {interactiveLessons.length} lessons completed
              </p>
              <Progress value={completionRate} className="h-2" />
            </div>
            <div className="text-3xl font-bold text-primary">
              {Math.round(completionRate)}%
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lessons List */}
      <div className="mt-6 space-y-3">
            {interactiveLessons.map((lesson) => {
              const isCompleted = completedLessons.includes(lesson.id);
              
              return (
                <Card 
                  key={lesson.id} 
                  className={cn("transition-all hover:shadow-md", isCompleted ? "bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700" : "bg-white dark:bg-slate-950")}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start gap-4">
                      {/* Status Icon */}
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                        isCompleted ? "bg-green-100 dark:bg-green-900/30" : "bg-primary/10"
                      )}>
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <PlayCircle className="w-5 h-5 text-primary" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className={cn("font-semibold", isCompleted && "text-slate-700 dark:text-slate-200")}>{lesson.title}</h3>
                          {isCompleted && (
                            <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">Completed</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{lesson.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {lesson.duration}
                          </span>
                          <Badge variant="secondary" className="text-xs">{lesson.category}</Badge>
                        </div>
                      </div>

                      {/* Action */}
                      <Button 
                        variant={isCompleted ? "outline" : "default"}
                        size="sm"
                        onClick={() => openLesson(lesson)}
                      >
                        {isCompleted ? 'Review' : savedProgress[lesson.id] ? 'Resume' : 'Start Lesson'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

      {/* Interactive Lesson Modal */}
      {activeLesson && (
        <Dialog open={!!activeLesson} onOpenChange={closeLesson}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex justify-between items-center pr-6">
                <Badge variant="secondary" className="mb-2">{activeLesson.category}</Badge>
                <span className="text-xs text-muted-foreground font-medium">
                  {lessonStep < activeLesson.steps.length 
                    ? `Step ${lessonStep + 1} of ${activeLesson.steps.length}`
                    : `Knowledge Check · ${activeLesson.quiz.length} Questions`}
                </span>
              </div>
              <DialogTitle className="text-2xl">{activeLesson.title}</DialogTitle>
            </DialogHeader>

            <div className="py-6 min-h-[250px]">
              {lessonStep < activeLesson.steps.length ? (
                // Lesson Slide
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <h3 className="text-xl font-semibold text-primary">{activeLesson.steps[lessonStep].title}</h3>
                  <div className="text-slate-700 leading-relaxed text-base">
                    {activeLesson.steps[lessonStep].content}
                  </div>
                </div>
              ) : (
                // Quiz Slide
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                      Knowledge Check
                    </h3>
                    {showQuizResult && activeLesson && (
                      <div className={cn(
                        "rounded-xl border px-4 py-3",
                        quizScore === activeLesson.quiz.length
                          ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-100"
                          : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100"
                      )}>
                        <p className="text-sm font-semibold">
                          Score: {quizScore}/{activeLesson.quiz.length}
                        </p>
                        <p className="text-sm opacity-90">
                          {quizScore === activeLesson.quiz.length
                            ? "Excellent work. You answered every question correctly."
                            : "Review the missed questions below and try again when you're ready."}
                        </p>
                      </div>
                    )}
                    {activeLesson.quiz.map((quiz, quizIndex) => (
                      <div key={quizIndex} className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4">
                        <p className="text-slate-800 dark:text-slate-200 font-medium">
                          {quizIndex + 1}. {quiz.question}
                        </p>

                        <RadioGroup
                          value={quizAnswers[quizIndex] !== undefined && quizAnswers[quizIndex] !== -1 ? quizAnswers[quizIndex].toString() : ""}
                          onValueChange={(val) => {
                            if (showQuizResult) return;

                            const nextAnswers = [...quizAnswers];
                            nextAnswers[quizIndex] = parseInt(val);
                            setQuizAnswers(nextAnswers);
                          }}
                          className="space-y-3 mt-4"
                          disabled={showQuizResult}
                        >
                          {quiz.options.map((option, optionIndex) => (
                            <div
                              key={optionIndex}
                              className={cn(
                                "flex items-start space-x-3 space-y-0 rounded-lg border bg-white dark:bg-slate-950 p-4 transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900",
                                quizAnswers[quizIndex] === optionIndex && !showQuizResult && "border-primary bg-primary/5",
                                showQuizResult && optionIndex === quiz.correctIndex && "border-green-500 bg-green-50 dark:bg-green-900/30",
                                showQuizResult && quizAnswers[quizIndex] === optionIndex && optionIndex !== quiz.correctIndex && "border-red-500 bg-red-50 dark:bg-red-900/30"
                              )}
                              onClick={() => {
                                if (showQuizResult) return;

                                const nextAnswers = [...quizAnswers];
                                nextAnswers[quizIndex] = optionIndex;
                                setQuizAnswers(nextAnswers);
                              }}
                            >
                              <RadioGroupItem value={optionIndex.toString()} id={`quiz-${quizIndex}-option-${optionIndex}`} className="mt-1" />
                              <Label htmlFor={`quiz-${quizIndex}-option-${optionIndex}`} className="font-normal cursor-pointer text-base leading-snug flex-1">
                                {option}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>

                        {showQuizResult && (
                          <div className={cn(
                            "p-4 rounded-lg flex gap-3 animate-in fade-in slide-in-from-bottom-2",
                              quizAnswers[quizIndex] === quiz.correctIndex ? "bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100" : "bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-100"
                          )}>
                            {quizAnswers[quizIndex] === quiz.correctIndex ? (
                                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
                            ) : (
                                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />
                            )}
                            <div>
                              <p className="font-semibold">
                                {quizAnswers[quizIndex] === quiz.correctIndex ? "Correct!" : "Incorrect"}
                              </p>
                              <p className="text-sm mt-1 opacity-90">{quiz.explanation}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex sm:justify-between items-center gap-3 border-t pt-4">
              <Button 
                variant="ghost" 
                onClick={handlePrevStep}
                disabled={lessonStep === 0 || showQuizResult}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>

              {lessonStep < activeLesson.steps.length ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleSaveAndClose}>Save & Close</Button>
                  <Button onClick={handleNextStep}>
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              ) : !showQuizResult ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleSaveAndClose}>Save & Close</Button>
                  <Button onClick={submitQuiz} disabled={quizAnswers.some((answer) => answer === -1)}>
                    Submit Answers
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {!activeLesson.quiz.every((question, index) => quizAnswers[index] === question.correctIndex) && (
                    <Button variant="outline" onClick={() => {
                      setShowQuizResult(false);
                    }}>
                      Review & Retry
                    </Button>
                  )}
                  <Button onClick={closeLesson}>
                    {activeLesson.quiz.every((question, index) => quizAnswers[index] === question.correctIndex) ? "Finish Lesson" : "Close"}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
