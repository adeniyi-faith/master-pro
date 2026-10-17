// Sample questions and answers used by the setup preview. They are written by hand, not by an AI: they show how the
// answer will be laid out and worded for each setting. The "real AI" preview button shows true output instead.

const SAMPLES = {
    interview: {
        label: 'Job Interview',
        heardLabel: 'Interviewer',
        question: 'Tell me about a time you handled a difficult client.',
        opening: {
            default: 'Last year a client pushed back hard on a deadline, and I turned that into a longer partnership.',
            simple: 'A client once got very upset about a deadline. I fixed it, and they stayed with us.',
            formal: 'In a previous role, a key client disputed a delivery deadline, and I resolved it in a way that strengthened the relationship.',
        },
        points: [
            {
                default: 'I called them the same day, listened to what was really worrying them, and found out a launch event was driving the date.',
                simple: 'I called them that day and listened. Their big event was the real reason for the date.',
                formal: 'I contacted them promptly, listened to their concerns, and established that a scheduled launch event was driving the date.',
            },
            {
                default: 'I split the work into two releases so the part they needed for the launch was ready early.',
                simple: 'I split the work in two, so the part they needed first was ready early.',
                formal: 'I restructured the project into two releases so that the components required for the launch were delivered first.',
            },
            {
                default: 'The launch went well, they renewed for another year, and they now refer new clients to us.',
                simple: 'The launch went well. They signed again for a year and sent us new clients.',
                formal: 'The launch was successful, the client renewed for a further year, and they have since referred new clients.',
            },
        ],
        star: {
            Situation: {
                default: 'A client pushed back hard on a deadline just before their product launch.',
                simple: 'A client got upset about a deadline before their launch.',
                formal: 'A key client disputed a delivery deadline shortly before their product launch.',
            },
            Task: {
                default: 'I had to protect the launch date without breaking the project.',
                simple: 'I had to save their launch date and not break the project.',
                formal: 'I was responsible for protecting the launch date without compromising the project.',
            },
            Action: {
                default: 'I called them the same day, found out what was driving the date, and split the work into two releases.',
                simple: 'I called them, found the real reason, and split the work in two.',
                formal: 'I contacted them promptly, established the underlying need, and divided the work into two releases.',
            },
            Result: {
                default: 'The launch went well, and they renewed for another year.',
                simple: 'The launch went well, and they signed again for a year.',
                formal: 'The launch succeeded and the client renewed for a further year.',
            },
        },
    },
    sales: {
        label: 'Sales Call',
        heardLabel: 'Prospect',
        question: 'Your price is higher than what we pay now.',
        opening: {
            default: "That's fair, and I'd rather be upfront about it: the price is higher than what you pay today.",
            simple: "That's fair. Yes, the price is higher than what you pay today.",
            formal: 'I appreciate you raising that. The price is indeed higher than your current arrangement.',
        },
        points: [
            {
                default: 'What I would look at together is what the current setup costs you in lost time and missed sales.',
                simple: 'Let us look at what your current setup costs you in lost time and missed sales.',
                formal: 'I would suggest we examine the cost of the current setup in terms of lost time and missed sales.',
            },
            {
                default: "Most teams find the difference shows up there, not on the invoice.",
                simple: 'Most teams find the difference is there, not on the bill.',
                formal: 'Most organisations find the difference is realised there rather than on the invoice.',
            },
            {
                default: 'Can we go through your numbers for five minutes and see if it adds up for you?',
                simple: 'Can we go through your numbers for five minutes?',
                formal: 'Would you be willing to review your figures with me briefly to assess whether it is worthwhile?',
            },
        ],
    },
    meeting: {
        label: 'Business Meeting',
        heardLabel: 'Colleague',
        question: "What's the status on the project?",
        opening: {
            default: "We're on track for the end of the month.",
            simple: 'We are on time for the end of the month.',
            formal: 'The project remains on schedule for completion at the end of the month.',
        },
        points: [
            {
                default: 'The design and the main build are finished.',
                simple: 'The design and main build are done.',
                formal: 'The design and the primary build phases are complete.',
            },
            {
                default: 'The one open item is the integration testing, which depends on the partner sending their test data.',
                simple: 'The one open item is testing. We are waiting for test data from the partner.',
                formal: 'The sole outstanding item is integration testing, which depends on receipt of test data from the partner.',
            },
            {
                default: "I'll chase that today and update the group by Thursday.",
                simple: 'I will chase it today and update everyone by Thursday.',
                formal: 'I will follow up today and provide an update to the group by Thursday.',
            },
        ],
    },
    presentation: {
        label: 'Presentation',
        heardLabel: 'Audience',
        question: "Isn't this too risky for a company our size?",
        opening: {
            default: "That's a fair worry, and I'd rather answer it directly.",
            simple: 'That is a fair worry, so let me answer it clearly.',
            formal: 'That is a reasonable concern, and I would like to address it directly.',
        },
        points: [
            {
                default: 'The main risk is the upfront cost, and we reduce it by starting with one team instead of the whole company.',
                simple: 'The main risk is the first cost. We lower it by starting with just one team.',
                formal: 'The principal risk is the initial investment, which we mitigate by beginning with a single team.',
            },
            {
                default: 'If it does not work in the first 60 days, you stop, and you have only spent a small part of the budget.',
                simple: 'If it does not work in 60 days, you stop. You only spent a little.',
                formal: 'Should it not deliver within 60 days, you may stop, having committed only a small portion of the budget.',
            },
            {
                default: 'I am happy to show you how that would look for a company of your size.',
                simple: 'I can show you how that would look for a company your size.',
                formal: 'I would be pleased to demonstrate how this would work for an organisation of your size.',
            },
        ],
    },
    negotiation: {
        label: 'Negotiation',
        heardLabel: 'Other side',
        question: "That price is too high for us. What's your best offer?",
        opening: {
            default: 'I understand, and I want this to work for both of us.',
            simple: 'I understand, and I want this to work for both of us.',
            formal: 'I understand your position, and I would like us to reach an arrangement that works for both parties.',
        },
        points: [
            {
                default: 'Can I ask what budget you had in mind?',
                simple: 'What budget did you have in mind?',
                formal: 'May I ask what budget you had in mind?',
            },
            {
                default: 'If there is a gap, I would rather look at the scope or the timeline first than lower the quality of what you get.',
                simple: 'If there is a gap, I would first change the scope or the timeline, not the quality.',
                formal: 'If there is a gap, I would prefer to adjust the scope or timeline before reducing the quality of what you receive.',
            },
            {
                default: 'And if we can agree on a longer commitment, I can be more flexible on the price.',
                simple: 'And if you commit for longer, I can be more flexible on price.',
                formal: 'Further, if a longer commitment is possible, I would be able to show more flexibility on price.',
            },
        ],
    },
    exam: {
        label: 'Exam Assistant',
        heardLabel: 'Question',
        question: 'What is the difference between a process and a thread?',
        opening: {
            default: 'A process is a running program with its own memory. A thread is a path of execution inside a process.',
            simple: 'A process is a running program with its own memory. A thread is a smaller task inside it.',
            formal: 'A process is an executing program with its own address space; a thread is a unit of execution within a process.',
        },
        points: [
            {
                default: 'Threads of one process share its memory, so switching between them is cheaper.',
                simple: 'Threads of one process share memory, so they are cheaper to switch between.',
                formal: 'Threads within a process share its memory, which makes context switching less costly.',
            },
            {
                default: 'Processes are isolated from each other, so one crashing does not bring down the others.',
                simple: 'Processes are separate, so if one crashes the others keep running.',
                formal: 'Processes are isolated from one another, so the failure of one does not affect the rest.',
            },
            {
                default: 'The trade-off: threads are faster to share data but need care to avoid conflicts.',
                simple: 'The trade-off: threads share data fast, but you must avoid conflicts.',
                formal: 'The trade-off is that threads share data efficiently but require synchronisation to avoid conflicts.',
            },
        ],
    },
};

function pick(options, tone) {
    return options[tone] || options.default;
}

// Builds the sample answer (as markdown) for the chosen settings.
// tone: default | simple | formal | custom. format: default | full_script | script_bullets | bullets.
function buildPreviewAnswer({ profile = 'interview', tone = 'default', format = 'default', star = false } = {}) {
    const sample = SAMPLES[profile] || SAMPLES.interview;
    const t = tone === 'custom' ? 'default' : tone;

    if (star && sample.star) {
        const lines = Object.entries(sample.star).map(([label, options]) => `**${label}:** ${pick(options, t)}`);
        if (format === 'bullets') return lines.map(l => `- ${l}`).join('\n');
        if (format === 'script_bullets') return `${pick(sample.opening, t)}\n\n${lines.map(l => `- ${l}`).join('\n')}`;
        return lines.join('\n\n');
    }

    const opening = pick(sample.opening, t);
    const points = sample.points.map(p => pick(p, t));

    if (format === 'bullets') return [opening, ...points].map(p => `- ${p}`).join('\n');
    if (format === 'script_bullets') return `${opening}\n\n${points.map(p => `- ${p}`).join('\n')}`;
    // default and full_script: one flowing script, split into short paragraphs
    return `${opening} ${points[0]}\n\n${points.slice(1).join(' ')}`;
}

function getPreviewQuestion(profile = 'interview') {
    return (SAMPLES[profile] || SAMPLES.interview).question;
}

function getPreviewMeta(profile = 'interview') {
    const sample = SAMPLES[profile] || SAMPLES.interview;
    return { label: sample.label, heardLabel: sample.heardLabel, hasStar: Boolean(sample.star) };
}

module.exports = { SAMPLES, buildPreviewAnswer, getPreviewQuestion, getPreviewMeta };
