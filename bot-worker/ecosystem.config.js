module.exports = {
    apps: [
        {
            name: 'meetingmind-bot-worker',
            script: 'src/worker.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'development',
            },
            env_production: {
                NODE_ENV: 'production',
                HEADLESS: 'true',
                DOCKER_RUN: 'false',
                FORCE_SYNC: 'false'
            }
        }
    ]
};
