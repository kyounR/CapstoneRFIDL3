from django.db import migrations, models
import django.db.models.deletion


def clear_legacy_remittances(apps, schema_editor):
    DispatchRound = apps.get_model('core', 'DispatchRound')
    DailyRemittance = apps.get_model('core', 'DailyRemittance')
    DispatchRound.objects.all().delete()
    DailyRemittance.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_driver_feesettings_terminal_vehicle_is_light_vehicle_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='dailyremittance',
            name='terminal',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='daily_remittances',
                to='core.terminal',
            ),
        ),
        migrations.AddField(
            model_name='dailyremittance',
            name='driver',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='daily_remittances',
                to='core.driver',
            ),
        ),
        migrations.AddField(
            model_name='dailyremittance',
            name='original_assigned_driver',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='core.driver',
            ),
        ),
        migrations.AddField(
            model_name='dailyremittance',
            name='substitute_fee',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='dailyremittance',
            name='terminal_fee_percentage',
            field=models.DecimalField(blank=True, null=True, decimal_places=2, max_digits=12),
        ),
        migrations.AddField(
            model_name='dailyremittance',
            name='is_finalized',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='dailyremittance',
            name='finalized_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(clear_legacy_remittances, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='dailyremittance',
            name='terminal_name',
        ),
        migrations.RemoveField(
            model_name='dailyremittance',
            name='driver_name',
        ),
        migrations.RemoveField(
            model_name='dailyremittance',
            name='terminal_fee',
        ),
        migrations.AlterField(
            model_name='dailyremittance',
            name='terminal',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='daily_remittances',
                to='core.terminal',
            ),
        ),
        migrations.AlterField(
            model_name='dailyremittance',
            name='driver',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='daily_remittances',
                to='core.driver',
            ),
        ),
        migrations.AlterField(
            model_name='dailyremittance',
            name='terminal_fee_percentage',
            field=models.DecimalField(decimal_places=2, max_digits=12),
        ),
    ]
