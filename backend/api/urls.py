from django.urls import path
from .views import ValuationAPIView, FeedbackAPIView, BlogListAPIView, BlogDetailAPIView

urlpatterns = [
    path('valuation/', ValuationAPIView.as_view(), name='valuation'),
    path('feedback/', FeedbackAPIView.as_view(), name='feedback'),
    path('blog/', BlogListAPIView.as_view(), name='blog-list'),
    path('blog/<int:pk>/', BlogDetailAPIView.as_view(), name='blog-detail'),
]
