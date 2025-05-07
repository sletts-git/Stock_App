# urls.py
from django.contrib import admin
from django.urls import path
from .views import (
    get_quote_data, get_options_data, get_sec_filings,
    get_news_data, get_financial_metrics
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/quote/<str:symbol>/', get_quote_data, name='get_quote_data'),
    path('api/options/<str:symbol>/', get_options_data, name='get_options_data'),
    path('api/filings/<str:symbol>/', get_sec_filings, name='get_sec_filings'),
    path('api/news/<str:symbol>/', get_news_data, name='get_news_data'),
    path('api/financials/<str:symbol>/', get_financial_metrics, name='get_financial_metrics'),
]
