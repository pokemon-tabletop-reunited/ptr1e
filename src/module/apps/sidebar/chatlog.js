class PTUChatLog extends foundry.applications.sidebar.tabs.ChatLog {
    /** @override */
    activateListeners($html) {
        super.activateListeners($html);

        $html.find('.tooltip').tooltipster({
			theme: `tooltipster-shadow ball-themes default`,
			position: 'top'
		});
    }
}

export { PTUChatLog }