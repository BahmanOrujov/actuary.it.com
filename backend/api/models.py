from django.db import models

class BlogPost(models.Model):
    title_en = models.CharField(max_length=500)
    title_az = models.CharField(max_length=500)
    excerpt_en = models.TextField()
    excerpt_az = models.TextField()
    content_en = models.TextField()
    content_az = models.TextField()
    date_en = models.CharField(max_length=100)
    date_az = models.CharField(max_length=100)
    read_time = models.IntegerField(default=5)
    source_url = models.URLField(max_length=1000)
    icon = models.CharField(max_length=10, default="📰")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title_en
