from django.apps import AppConfig

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        import sys
        import threading
        import time
        
        # Start scheduler when running web server (runserver, gunicorn, etc.)
        # Skip during setup commands, migrations, or shell tasks
        is_server = False
        if len(sys.argv) > 1:
            if sys.argv[1] in ['runserver', 'runserver_plus']:
                is_server = True
        else:
            # Gunicorn typically executes wsgi without arguments in sys.argv
            is_server = True
            
        if is_server:
            def start_scheduler():
                time.sleep(5) # Give the database and django tables time to fully boot up
                from api.scraper import scrape_actuarial_news
                while True:
                    try:
                        scrape_actuarial_news()
                    except Exception as e:
                        print(f"Daily scraper scheduler error: {e}", flush=True)
                    time.sleep(24 * 3600)
                    
            thread = threading.Thread(target=start_scheduler)
            thread.daemon = True
            thread.start()
